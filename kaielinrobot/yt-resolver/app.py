import hashlib
import json
import mimetypes
import os
import shutil
import subprocess
import sys
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urlsplit, urlunsplit

from flask import Flask, abort, jsonify, request, send_file
from urllib.error import HTTPError
from urllib.request import Request, urlopen


YT_SOURCE = Path(os.environ.get("YT_DLP_SOURCE", "/opt/yt-dlp-master"))
if YT_SOURCE.exists():
    sys.path.insert(0, str(YT_SOURCE))

try:
    from yt_dlp import YoutubeDL
except Exception as exc:  # pragma: no cover - startup failure
    raise RuntimeError(f"failed to import yt_dlp: {exc}") from exc


PORT = int(os.environ.get("PORT", "8088"))
CACHE_DIR = Path(os.environ.get("YT_CACHE_DIR", "/yt-cache"))
JOBS_DIR = CACHE_DIR / "jobs"
MAX_WORKERS = max(1, int(os.environ.get("YT_MAX_WORKERS", "2")))
JOB_TTL_SECONDS = int(os.environ.get("YT_JOB_TTL_SECONDS", str(7 * 24 * 3600)))
KEEP_DONE_MEDIA_SECONDS = int(os.environ.get("YT_KEEP_DONE_MEDIA_SECONDS", "600"))
MAX_CACHE_BYTES = int(os.environ.get("YT_MAX_CACHE_BYTES", str(2 * 1024 * 1024 * 1024)))
KEEP_MEDIA_AFTER_SEND = os.environ.get("YT_KEEP_MEDIA_AFTER_SEND", "").strip().lower() in {"1", "true", "yes", "on"}
COOKIES_FILE = os.environ.get("YT_COOKIES_FILE", "").strip()

app = Flask(__name__)
executor = ThreadPoolExecutor(max_workers=MAX_WORKERS)
lock = threading.RLock()
jobs: dict[str, dict[str, Any]] = {}
url_index: dict[str, str] = {}


def now_ms() -> int:
    return int(time.time() * 1000)


def ensure_dirs() -> None:
    JOBS_DIR.mkdir(parents=True, exist_ok=True)


def normalize_url(url: str) -> str:
    url = str(url or "").strip()
    if not url:
        return ""
    parts = urlsplit(url)
    if not parts.scheme or not parts.netloc:
        return url
    return urlunsplit((parts.scheme, parts.netloc, parts.path, parts.query, ""))


def resolve_redirect_url(url: str) -> str:
    url = normalize_url(url)
    if not url:
        return ""

    try:
        request = Request(
            url,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/126.0.0.0 Safari/537.36"
                ),
                "Accept": (
                    "text/html,application/xhtml+xml,application/xml;"
                    "q=0.9,image/avif,image/webp,*/*;q=0.8"
                ),
                "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            },
            method="GET",
        )
        with urlopen(request, timeout=15) as response:
            final_url = getattr(response, "url", None) or response.geturl() or url
            if final_url:
                return normalize_url(final_url)
    except HTTPError as exc:
        final_url = getattr(exc, "url", None)
        if final_url:
            return normalize_url(final_url)
    except Exception:
        pass

    return url


def expand_url_candidates(url: str) -> list[str]:
    url = normalize_url(url)
    if not url:
        return []

    candidates = [url]
    seen = {url}
    current = url

    for _ in range(3):
        parsed = urlsplit(current)
        query = parse_qs(parsed.query, keep_blank_values=True)
        nested = None
        for key in (
            "url",
            "u",
            "targeturl",
            "target_url",
            "jumpurl",
            "jump_url",
            "shareurl",
            "share_url",
            "pfurl",
            "innerurl",
            "inner_url",
            "redirect",
            "redirect_url",
            "rurl",
            "link",
            "dest",
            "destination",
            "srcurl",
            "src_url",
            "surl",
        ):
            values = query.get(key)
            if values:
                nested = values[0]
                break

        if nested:
            decoded = normalize_url(unquote(nested))
            if decoded and decoded not in seen:
                seen.add(decoded)
                candidates.append(decoded)
                current = decoded
                continue

        redirected = resolve_redirect_url(current)
        if redirected and redirected not in seen:
            seen.add(redirected)
            candidates.append(redirected)
            current = redirected
            continue

        break

    return candidates


def job_dir(job_id: str) -> Path:
    return JOBS_DIR / job_id


def job_json_path(job_id: str) -> Path:
    return job_dir(job_id) / "job.json"


def touch_job(job_id: str, **changes: Any) -> dict[str, Any]:
    with lock:
        job = jobs.get(job_id)
        if not job:
            raise KeyError(job_id)
        job.update(changes)
        job["updatedAt"] = now_ms()
        job_dir(job_id).mkdir(parents=True, exist_ok=True)
        job_json_path(job_id).write_text(
            json.dumps(job, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return job


def public_job(job: dict[str, Any]) -> dict[str, Any]:
    data = dict(job)
    return data


def load_existing_jobs() -> None:
    ensure_dirs()
    with lock:
        for path in JOBS_DIR.iterdir():
            if not path.is_dir():
                continue
            job_file = path / "job.json"
            if not job_file.exists():
                continue
            try:
                job = json.loads(job_file.read_text(encoding="utf-8"))
                job_id = str(job.get("id") or path.name)
                job["id"] = job_id
                jobs[job_id] = job
                normalized_url = str(job.get("normalizedUrl") or "")
                if normalized_url:
                    url_index[normalized_url] = job_id
            except Exception:
                continue


def choose_existing_job(normalized_url: str) -> dict[str, Any] | None:
    with lock:
        job_id = url_index.get(normalized_url)
        if not job_id:
            return None
        job = jobs.get(job_id)
        if not job:
            return None
        if job.get("status") in {"done", "running", "queued"}:
            return job
        return job


def create_job_record(url: str, normalized_url: str) -> dict[str, Any]:
    job_id = uuid.uuid4().hex
    dir_path = job_dir(job_id)
    dir_path.mkdir(parents=True, exist_ok=True)
    job = {
        "id": job_id,
        "url": url,
        "normalizedUrl": normalized_url,
        "status": "queued",
        "createdAt": now_ms(),
        "updatedAt": now_ms(),
        "title": None,
        "uploader": None,
        "platform": None,
        "duration": None,
        "thumbnailPath": None,
        "mediaPath": None,
        "sourcePath": None,
        "error": None,
        "progress": 0,
        "totalBytes": None,
        "downloadedBytes": None,
        "webpageUrl": None,
        "consumed": False,
    }
    jobs[job_id] = job
    url_index[normalized_url] = job_id
    job_json_path(job_id).write_text(
        json.dumps(job, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return job


def find_media_source_file(dir_path: Path, video_id: str) -> Path | None:
    preferred_exts = [".mp4", ".mkv", ".webm", ".mov", ".m4v", ".flv", ".avi", ".ts"]
    candidates: list[Path] = []
    for ext in preferred_exts:
        candidates.extend(sorted(dir_path.glob(f"{video_id}{ext}")))
        candidates.extend(sorted(dir_path.glob(f"{video_id}*.{ext.lstrip('.')}")))
    if candidates:
        return candidates[0]
    for ext in ["*.mp4", "*.mkv", "*.webm", "*.mov", "*.m4v", "*.flv", "*.avi", "*.ts"]:
        for item in sorted(dir_path.glob(ext)):
            if item.name.endswith(".part"):
                continue
            if item.name.endswith(".info.json"):
                continue
            return item
    return None


def find_thumbnail_file(dir_path: Path) -> Path | None:
    thumb_exts = [".jpg", ".jpeg", ".png", ".webp", ".gif"]
    for ext in thumb_exts:
        matches = sorted(dir_path.glob(f"*{ext}"))
        if matches:
            return matches[0]
    return None


def ffprobe_codec(file_path: Path, stream: str) -> str | None:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        stream,
        "-show_entries",
        "stream=codec_name",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        str(file_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        return None
    codec = result.stdout.strip().splitlines()
    return codec[0].strip() if codec else None


def is_mp4_playable(file_path: Path) -> bool:
    if file_path.suffix.lower() != ".mp4":
        return False
    vcodec = ffprobe_codec(file_path, "v:0")
    acodec = ffprobe_codec(file_path, "a:0")
    return vcodec == "h264" and (acodec in {"aac", "mp3", None, ""})


def transcode_to_mp4(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(source),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        str(target),
    ]
    subprocess.run(cmd, capture_output=True, text=True, check=True)


def finalize_media_file(source: Path, target: Path) -> Path:
    if source.resolve() == target.resolve():
        return target
    if is_mp4_playable(source):
        shutil.copy2(source, target)
        return target
    transcode_to_mp4(source, target)
    return target


def safe_unlink(path: str | Path | None) -> None:
    if not path:
        return
    try:
        p = Path(path)
        if p.exists() and p.is_file():
            p.unlink()
    except Exception:
        pass


def delete_job_files(job: dict[str, Any], delete_media: bool = True) -> None:
    media_path = job.get("mediaPath")
    thumb_path = job.get("thumbnailPath")
    source_path = job.get("sourcePath")
    job_dir_path = job_dir(str(job["id"]))

    if delete_media:
        safe_unlink(media_path)
        safe_unlink(thumb_path)
        safe_unlink(source_path)

    if job_dir_path.exists():
        try:
            shutil.rmtree(job_dir_path, ignore_errors=True)
        except Exception:
            pass


def cache_size_bytes() -> int:
    total = 0
    try:
        for path in JOBS_DIR.rglob("*"):
            if path.is_file():
                try:
                    total += path.stat().st_size
                except Exception:
                    continue
    except Exception:
        return total
    return total


def cleanup_consumed_job(job_id: str) -> None:
    with lock:
        job = jobs.get(job_id)
        if not job:
            return
        job["consumed"] = True
        job["consumedAt"] = now_ms()
        job["updatedAt"] = now_ms()
        if KEEP_MEDIA_AFTER_SEND:
            job_json_path(job_id).write_text(
                json.dumps(job, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            return

        url_index.pop(str(job.get("normalizedUrl") or ""), None)
        jobs.pop(job_id, None)

    delete_job_files(job, delete_media=True)


def cleanup_cache_budget() -> None:
    try:
        if cache_size_bytes() <= MAX_CACHE_BYTES:
            return
        with lock:
            ordered = sorted(
                jobs.values(),
                key=lambda item: int(item.get("updatedAt") or 0),
            )
        for job in ordered:
            if cache_size_bytes() <= MAX_CACHE_BYTES:
                break
            if job.get("status") != "done":
                continue
            if not job.get("mediaPath"):
                continue
            if KEEP_MEDIA_AFTER_SEND:
                safe_unlink(job.get("mediaPath"))
                safe_unlink(job.get("thumbnailPath"))
                safe_unlink(job.get("sourcePath"))
                with lock:
                    job["mediaPath"] = None
                    job["thumbnailPath"] = None
                    job["sourcePath"] = None
                    job["updatedAt"] = now_ms()
                    job_json_path(str(job["id"])).write_text(
                        json.dumps(job, ensure_ascii=False, indent=2),
                        encoding="utf-8",
                    )
            else:
                delete_job_files(job, delete_media=True)
                with lock:
                    url_index.pop(str(job.get("normalizedUrl") or ""), None)
                    jobs.pop(str(job["id"]), None)
    except Exception:
        pass


def build_ydl_opts(job: dict[str, Any]) -> dict[str, Any]:
    dir_path = job_dir(job["id"])
    opts = {
        "format": "bv*+ba/b",
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "retries": 3,
        "fragment_retries": 3,
        "socket_timeout": 30,
        "merge_output_format": "mp4",
        "http_headers": {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/126.0.0.0 Safari/537.36"
            ),
            "Referer": "https://www.bilibili.com/",
            "Origin": "https://www.bilibili.com",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        },
        "writethumbnail": True,
        "writeinfojson": True,
        "outtmpl": str(dir_path / "%(id)s.%(ext)s"),
        "paths": {
            "home": str(dir_path),
            "temp": str(dir_path),
        },
        "progress_hooks": [lambda status: progress_hook(job["id"], status)],
    }
    if COOKIES_FILE and Path(COOKIES_FILE).exists():
        opts["cookiefile"] = COOKIES_FILE
    return opts


def progress_hook(job_id: str, status: dict[str, Any]) -> None:
    state = str(status.get("status") or "")
    update: dict[str, Any] = {}
    if state == "downloading":
        downloaded = status.get("downloaded_bytes")
        total = status.get("total_bytes") or status.get("total_bytes_estimate")
        update["status"] = "downloading"
        if isinstance(downloaded, int):
            update["downloadedBytes"] = downloaded
        if isinstance(total, int):
            update["totalBytes"] = total
        if isinstance(downloaded, int) and isinstance(total, int) and total > 0:
            update["progress"] = round(downloaded * 100 / total, 2)
    elif state == "finished":
        update["status"] = "processing"
        update["progress"] = 100
    if update:
        try:
            touch_job(job_id, **update)
        except KeyError:
            pass


def run_job(job_id: str) -> None:
    with lock:
        job = jobs[job_id]
    job_dir(job_id).mkdir(parents=True, exist_ok=True)
    touch_job(job_id, status="running", error=None)

    try:
        url = str(job["url"])
        resolved_url = resolve_redirect_url(url)
        if not resolved_url:
            resolved_url = url
        expanded_candidates = expand_url_candidates(resolved_url)
        if url not in expanded_candidates:
            expanded_candidates.append(url)
        seen_candidates: list[str] = []
        for candidate in expanded_candidates:
            normalized = normalize_url(candidate)
            if normalized and normalized not in seen_candidates:
                seen_candidates.append(normalized)
        expanded_candidates = seen_candidates

        last_error = None
        with YoutubeDL(build_ydl_opts(job)) as ydl:
            info = None
            for candidate in expanded_candidates:
                try:
                    print(f"[yt-resolver] trying {candidate}", flush=True)
                    info = ydl.extract_info(candidate, download=True)
                    if isinstance(info, dict):
                        break
                except Exception as exc:
                    print(f"[yt-resolver] failed {candidate}: {exc}", flush=True)
                    last_error = exc
                    continue
        if not isinstance(info, dict):
            if last_error is not None:
                raise last_error
            raise RuntimeError("yt-dlp returned no metadata")

        video_id = str(info.get("id") or job_id)
        title = info.get("title")
        uploader = info.get("uploader") or info.get("channel") or info.get("creator")
        duration = info.get("duration")
        webpage_url = info.get("webpage_url") or url
        extractor = info.get("extractor_key") or info.get("extractor") or "unknown"

        source_file = find_media_source_file(job_dir(job_id), video_id)
        if not source_file:
            raise RuntimeError("download finished but media file not found")

        final_file = job_dir(job_id) / "output.mp4"
        finalized = finalize_media_file(source_file, final_file)

        thumb = find_thumbnail_file(job_dir(job_id))
        if thumb is None:
            thumb_url = info.get("thumbnail")
            if thumb_url:
                thumb = None
        else:
            thumb_url = None

        meta = {
            "id": job_id,
            "url": url,
            "normalizedUrl": job["normalizedUrl"],
            "status": "done",
            "createdAt": job["createdAt"],
            "updatedAt": now_ms(),
            "title": title,
            "uploader": uploader,
            "platform": extractor,
            "duration": duration,
            "webpageUrl": webpage_url,
            "thumbnailPath": str(thumb) if thumb else None,
            "thumbnailUrl": thumb_url if thumb is None else None,
            "mediaPath": str(finalized),
            "sourcePath": str(source_file),
            "error": None,
            "progress": 100,
            "totalBytes": finalized.stat().st_size if finalized.exists() else None,
            "downloadedBytes": finalized.stat().st_size if finalized.exists() else None,
            "info": {
                "title": title,
                "uploader": uploader,
                "duration": duration,
                "extractor_key": extractor,
                "webpage_url": webpage_url,
            },
            "consumed": False,
        }
        touch_job(job_id, **meta)
        cleanup_cache_budget()
    except Exception as exc:
        touch_job(job_id, status="failed", error=str(exc), progress=0)


def schedule_job(url: str) -> dict[str, Any]:
    normalized_url = normalize_url(url)
    if not normalized_url:
        raise ValueError("empty url")

    existing = choose_existing_job(normalized_url)
    if existing and existing.get("status") in {"queued", "running", "downloading", "processing", "done"}:
        return existing

    with lock:
        job = create_job_record(url, normalized_url)
    executor.submit(run_job, job["id"])
    return job


def job_response(job_id: str) -> dict[str, Any]:
    with lock:
        job = jobs.get(job_id)
    if not job:
        abort(404, description="job not found")
    return public_job(job)


@app.get("/health")
def health() -> Any:
    return jsonify({"ok": True, "jobs": len(jobs)})


@app.post("/resolve")
def resolve() -> Any:
    payload = request.get_json(silent=True) or {}
    url = str(payload.get("url") or "").strip()
    if not url:
        return jsonify({"error": "missing url"}), 400
    try:
        job = schedule_job(url)
        return jsonify(public_job(job))
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400


@app.get("/job/<job_id>")
def get_job(job_id: str) -> Any:
    return jsonify(job_response(job_id))


@app.post("/job/<job_id>/consume")
def consume_job(job_id: str) -> Any:
    job = job_response(job_id)
    if job.get("status") != "done":
        return jsonify({"error": "job not ready"}), 400
    cleanup_consumed_job(job_id)
    return jsonify({"ok": True, "id": job_id})


@app.get("/media/<job_id>")
def get_media(job_id: str) -> Any:
    job = job_response(job_id)
    media_path = job.get("mediaPath")
    if not media_path:
        abort(404, description="media not ready")
    path = Path(media_path)
    if not path.exists():
        abort(404, description="media missing")
    mime = mimetypes.guess_type(path.name)[0] or "video/mp4"
    return send_file(path, mimetype=mime, as_attachment=False, conditional=True)


@app.get("/thumb/<job_id>")
def get_thumb(job_id: str) -> Any:
    job = job_response(job_id)
    thumb_path = job.get("thumbnailPath")
    if thumb_path:
        path = Path(thumb_path)
        if not path.exists():
            abort(404, description="thumbnail missing")
        mime = mimetypes.guess_type(path.name)[0] or "image/jpeg"
        return send_file(path, mimetype=mime, as_attachment=False, conditional=True)
    thumb_url = job.get("thumbnailUrl")
    if not thumb_url:
        abort(404, description="thumbnail not available")
    return jsonify({"thumbnailUrl": thumb_url})


def cleanup_worker() -> None:
    while True:
        time.sleep(180)
        cutoff = time.time() - JOB_TTL_SECONDS
        try:
            for item in JOBS_DIR.iterdir():
                if not item.is_dir():
                    continue
                try:
                    job_file = item / "job.json"
                    if job_file.exists():
                        try:
                            job = json.loads(job_file.read_text(encoding="utf-8"))
                            consumed_at = int(job.get("consumedAt") or 0) / 1000
                            updated_at = int(job.get("updatedAt") or 0) / 1000
                            done_at = consumed_at or updated_at
                            if job.get("status") == "done" and done_at and time.time() - done_at > KEEP_DONE_MEDIA_SECONDS:
                                shutil.rmtree(item, ignore_errors=True)
                                continue
                        except Exception:
                            pass
                    if item.stat().st_mtime < cutoff:
                        shutil.rmtree(item, ignore_errors=True)
                except Exception:
                    continue
        except Exception:
            continue


if __name__ == "__main__":
    ensure_dirs()
    load_existing_jobs()
    threading.Thread(target=cleanup_worker, daemon=True).start()
    app.run(host="0.0.0.0", port=PORT, threaded=True)
