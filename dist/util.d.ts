export declare function decodeBase64ArrayBuffer(base64: string): ArrayBuffer;
export declare function decodeBlobArrayBuffer(blob: Blob): Promise<ArrayBuffer>;
export declare class MultiMap<K, V> extends Map<K, Set<V>> {
    add(key: K, value: V): void;
    delete(key: K, value?: V): boolean;
    allValues(): IterableIterator<V>;
}
