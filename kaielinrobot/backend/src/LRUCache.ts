export class LRUCache{
    constructor(public size: number) {
        this.size = size;
        this.cache = new Map();
    }
    get(key: string|number) {
        if (!this.cache.has(key)) {
            return null;
        }
        const value = this.cache.get(key);
        // 将最近使用的项移动到末尾
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }
    set(key: string|number, value: object) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.size) {
            // 删除最旧的项
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, value);
    }
    has(key: string|number) {
        return this.cache.has(key);
    }
    delete(key: string|number) {
        this.cache.delete(key);
    }
    clear() {
        this.cache.clear();
    }
    getCacheSize() {
        return this.cache.size;
    }
    getMaxSize() {
        return this.size;
    }
    private cache: Map<string|number, object>;
}

export class LRUCacheNumber{
    constructor(public size: number) {
        this.size = size;
        this.cache = new Map();
    }
    get(key: string|number) {
        if (!this.cache.has(key)) {
            return null;
        }
        const value = this.cache.get(key);
        // 将最近使用的项移动到末尾
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }
    set(key: string|number, value: number) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.size) {
            // 删除最旧的项
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, value);
    }
    has(key: string|number) {
        return this.cache.has(key);
    }
    delete(key: string|number) {
        this.cache.delete(key);
    }
    clear() {
        this.cache.clear();
    }
    getCacheSize() {
        return this.cache.size;
    }
    getMaxSize() {
        return this.size;
    }
    private cache: Map<string|number, number>;
}

export class LRUCacheAny{
    constructor(public size: number) {
        this.size = size;
        this.cache = new Map();
    }
    get(key: string|number) {
        if (!this.cache.has(key)) {
            return null;
        }
        const value = this.cache.get(key);
        // 将最近使用的项移动到末尾
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }
    set(key: string|number, value: any) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.size) {
            // 删除最旧的项
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, value);
    }
    has(key: string|number) {
        return this.cache.has(key);
    }
    delete(key: string|number) {
        this.cache.delete(key);
    }
    clear() {
        this.cache.clear();
    }
    getCacheSize() {
        return this.cache.size;
    }
    getMaxSize() {
        return this.size;
    }
    private cache: Map<string|number, any>;
}