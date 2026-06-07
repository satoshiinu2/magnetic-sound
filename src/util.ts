export function decodeBase64ArrayBuffer(base64: string): ArrayBuffer {
    const cleanBase64 = base64.split(',')[1] || base64;
    const binaryString = atob(cleanBase64);
    const byteArray = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        byteArray[i] = binaryString.charCodeAt(i);
    }
    return byteArray.buffer;
}

export function decodeBlobArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = reject;
        reader.readAsArrayBuffer(blob);
    });
}

export class MultiMap<K, V> extends Map<K, Set<V>> {
    add(key: K, value: V) {
        let set = this.get(key);
        if (!set) {
            set = new Set();
            this.set(key, set);
        }
        set.add(value);
    }

    override delete(key: K, value?: V): boolean {
        if (arguments.length === 1) {
            return super.delete(key);
        }
        const set = this.get(key);
        if (!set) return false;
        const result = set.delete(value!);
        if (set.size === 0) {
            super.delete(key);
        }
        return result;
    }

    * allValues(): IterableIterator<V> {
        for (const set of this.values()) {
            yield* set;
        }
    }
}
