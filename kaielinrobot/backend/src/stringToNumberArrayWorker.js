export async function stringToNumberArray(stringArray) {
    const numberArray = [];
    for (let i = 0; i < stringArray.length; i++) {
        const v = stringArray[i];
        if (v == null) {
            numberArray.push(null);
        } else {
            numberArray.push(Number(v));
        }
    }
    return numberArray;
}
