import { jest, describe, test, expect, beforeEach } from "@jest/globals";
import { SoundSystem, SoundEntry, SoundSourceUrl, SoundListenerEntity } from "../src/index";
import { MultiMap } from "../src/util";

/**
 * Web Audio API の最小限のモック
 */
class MockAudioParam {
    value = 0;
    setValueAtTime = jest.fn((val: number) => { this.value = val; });
    setTargetAtTime = jest.fn((val: number) => { this.value = val; });
}

class MockGainNode {
    gain = new MockAudioParam();
    connect = jest.fn();
}

class MockAudioBufferSourceNode {
    buffer: any = null;
    loop = false;
    playbackRate = new MockAudioParam();
    connect = jest.fn();
    start = jest.fn();
    stop = jest.fn();
    onended: (() => void) | null = null;
}

class MockAudioContext {
    currentTime = 0;
    createGain() { return new MockGainNode(); }
    createBufferSource() { return new MockAudioBufferSourceNode(); }
    listener = {
        positionX: new MockAudioParam(),
        positionY: new MockAudioParam(),
        positionZ: new MockAudioParam(),
        forwardX: new MockAudioParam(),
        forwardY: new MockAudioParam(),
        forwardZ: new MockAudioParam(),
    };
    resume = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
}

// グローバルに AudioContext をモック登録（Jest等の環境想定）
(globalThis as any).AudioContext = MockAudioContext;

// jsdom 環境で structuredClone が定義されていない場合のポリフィル
if (typeof globalThis.structuredClone !== "function") {
    (globalThis as any).structuredClone = (val: any) => (val === undefined ? undefined : JSON.parse(JSON.stringify(val)));
}

describe("MultiMap Utility", () => {
    test("同じキーに対して複数の値を追加し、保持できる", () => {
        const map = new MultiMap<string, number>();
        map.add("group1", 1);
        map.add("group1", 2);
        map.add("group2", 3);

        expect(map.size).toBe(2); // グループ数
        expect(map.get("group1")?.size).toBe(2);
        expect(map.get("group2")?.size).toBe(1);
    });

    test("allValues ですべての値をフラットに反復できる", () => {
        const map = new MultiMap<string, number>();
        map.add("a", 1);
        map.add("b", 2);
        const vals = Array.from(map.allValues());
        expect(vals).toEqual(expect.arrayContaining([1, 2]));
    });

    test("delete で特定の値を削除し、空になったキーも削除される", () => {
        const map = new MultiMap<string, number>();
        map.add("k", 1);
        map.add("k", 2);
        map.delete("k", 1);
        expect(map.get("k")?.has(1)).toBe(false);
        expect(map.get("k")?.has(2)).toBe(true);
        map.delete("k", 2);
        expect(map.has("k")).toBe(false);
    });
});

describe("SoundSystem Grouping Logic", () => {
    let system: SoundSystem;

    beforeEach(() => {
        system = new SoundSystem();
        // テスト用に強制初期化
        (system as any).context = new AudioContext();
        (system as any)._isFullyInitedFlag = true;
    });

    test("サウンドが指定されたグループに登録される", () => {
        const seGroup = "effects";
        const source = new SoundSourceUrl("test.mp3", { group: seGroup });
        // AudioBuffer のデコード済み状態を模倣
        (source as any).audioBuffer = {} as AudioBuffer;

        const entry = new SoundEntry(source);
        system.play(entry);

        const soundMap = (system as any)._soundMap as MultiMap<string, SoundEntry>;
        expect(soundMap.get(seGroup)?.has(entry)).toBe(true);
    });

    test("マスターボリュームおよびグループボリュームの設定", () => {
        const source = new SoundSourceUrl("test.mp3", { group: "se" });
        (source as any).audioBuffer = {} as AudioBuffer;
        const entry = system.play(new SoundEntry(source));

        system.setGlobalGain(0.5);
        const baseGainNode = (entry as any).baseGainNode as MockGainNode;
        expect(baseGainNode.gain.setValueAtTime).toHaveBeenCalledWith(0.5, expect.any(Number));

        system.setGroupGain("se", 0.7);
        expect(baseGainNode.gain.setValueAtTime).toHaveBeenCalledWith(0.7, expect.any(Number));
    });

    test("updateTick で再生終了したサウンドが削除され、空になったグループも削除される", () => {
        const source = new SoundSourceUrl("test.mp3", { group: "temp" });
        (source as any).audioBuffer = {} as AudioBuffer;
        const entry = system.play(new SoundEntry(source));

        entry.wasEnded = true;
        system.updateTick();

        const soundMap = (system as any)._soundMap as MultiMap<string, SoundEntry>;
        expect(soundMap.has("temp")).toBe(false);
    });
});

describe("SoundEntry Properties & Dynamics", () => {
    let system: SoundSystem;

    beforeEach(() => {
        system = new SoundSystem();
        (system as any).context = new AudioContext();
        (system as any)._isFullyInitedFlag = true;
    });

    test("should apply gain, loop, and pitch on start", () => {
        const source = new SoundSourceUrl("test.mp3");
        (source as any).audioBuffer = {} as AudioBuffer;
        const entry = new SoundEntry(source, { gain: 0.3, loop: true, pitch: 1.5 });

        system.play(entry);

        const gainNode = (entry as any).gainNode as MockGainNode;
        const sourceNode = (entry as any).source as MockAudioBufferSourceNode;

        expect(gainNode.gain.setTargetAtTime).toHaveBeenCalled();
        expect(sourceNode.loop).toBe(true);
        expect(sourceNode.playbackRate.setValueAtTime).toHaveBeenCalled();
    });

    test("should update gain and pitch dynamically during playback", () => {
        const source = new SoundSourceUrl("test.mp3");
        (source as any).audioBuffer = {} as AudioBuffer;
        const entry = system.play(new SoundEntry(source));

        entry.setGain(0.8);
        const gainNode = (entry as any).gainNode as MockGainNode;
        expect(gainNode.gain.setTargetAtTime).toHaveBeenCalledWith(0.8, expect.any(Number), 0.01);

        entry.setPitch(0.5);
        const sourceNode = (entry as any).source as MockAudioBufferSourceNode;
        expect(sourceNode.playbackRate.setValueAtTime).toHaveBeenCalledWith(0.5, expect.any(Number));
    });
});

describe("Spatial Audio Support", () => {
    test("should update listener position and orientation", () => {
        const system = new SoundSystem();
        (system as any).context = new AudioContext();

        const pos: [number, number, number] = [10, 20, 30];
        const orient: [number, number, number] = [0, 0, -1];

        const listener: SoundListenerEntity = {
            getSoundEarPos: () => pos,
            getSoundEarOrient: () => orient,
        };
        system.setListener(listener);

        system.updateTick();

        const ctx = (system as any).context as MockAudioContext;
        expect(ctx.listener.positionX.setValueAtTime).toHaveBeenCalledWith(10, expect.any(Number));
        expect(ctx.listener.forwardZ.setValueAtTime).toHaveBeenCalledWith(-1, expect.any(Number));
    });
});