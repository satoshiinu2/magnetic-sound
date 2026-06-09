import { decodeBase64ArrayBuffer, decodeBlobArrayBuffer, MultiMap } from "./util";

/** 
 * @example
    const soundSystem = new Magnetic.SoundSystem();
    const soundSource = soundSystem.registerSource(new Magnetic.SoundSourceUrl("./example_sound.mp3"));

    async function init() {
        await soundSystem.loadAllQueuedSources();

        requestAnimationFrame(onFrame);
    }
    function play() {
        const soundEntry = new Magnetic.SoundEntryPositioned(soundSource, 1, 2, 3, 0, 1, 0);

        soundSystem.play(soundEntry);
    }
    function onFrame() {
        soundSystem.updateTick();

        requestAnimationFrame(onFrame);
    }
    init();
*/

const DEFAULT_GROUP_NAME = "default";

/**
 * The main class that manages the Web Audio API, sound playback, loading, and listener state updates.
 * It includes automatic resumption of the AudioContext to comply with browser auto-play policies.
 */
export class SoundSystem {
    /**
     * The Web Audio API Context.
     */
    public context?: AudioContext;

    /**
     * Initializes the SoundSystem.
     * @param tps Ticks Per Second used for timing interpolation. Set to 0 to disable interpolation.
     */
    constructor(public tps: number = 0) {
        document.addEventListener("click", this.activeContext.bind(this));

        document.addEventListener('visibilitychange', () => {
            for (const soundEntry of this._soundMap.allValues()) {
                if (soundEntry instanceof AbstractSoundEntryPositioned) {
                    soundEntry._checkScreenHideAndMute();
                }

            }

            if (!document.hidden) {
                this.context?.resume();
            }
        });

    }


    /**
     * Loads all registered sound sources and starts decoding them if the context is initialized.
     * @returns A promise resolving to an array of load results.
     */
    public async loadAllQueuedSources(): Promise<any[]> {
        const sources = Array.from(this._loadQueue);
        this._loadQueue.clear();
        const promises = sources.map(async source => {
            const result = await source.load();

            if (this._isInited()) {
                await source.decode(this.context);
            } else {
                this._decodeQueue.add(source);
            }

            return result;
        });
        return await Promise.all(promises);
    }

    /**
     * Updates the sound system state. This should be called every frame.
     * Updates the listener's position and cleans up finished sound entries.
     * @param optionalPartialTicks The progress between ticks for interpolation (0.0 to 1.0).
     * @default 1
     */
    public updateTick(optionalPartialTicks = 1): void {
        if (!this._isInited()) return;
        const pos = this._getSoundEarPos(optionalPartialTicks);
        const orient = this._getSoundEarOrient(optionalPartialTicks);
        const time = this._getNextTickTime();
        const listener = this.context.listener;
        if (listener.positionX) {
            listener.positionX.setValueAtTime(pos[0], time);
            listener.positionY.setValueAtTime(pos[1], time);
            listener.positionZ.setValueAtTime(pos[2], time);
            listener.forwardX.setValueAtTime(orient[0], time);
            listener.forwardY.setValueAtTime(orient[1], time);
            listener.forwardZ.setValueAtTime(orient[2], time);
        } else {
            listener.setPosition(pos[0], pos[1], pos[2]);
            // orientationは forward(x,y,z) と up(x,y,z) の6引数が必要
            listener.setOrientation(orient[0], orient[1], orient[2], 0, 1, 0);
        }

        for (const [group, entries] of this._soundMap) {
            for (const soundEntry of entries) {
                soundEntry.updateTick(this, optionalPartialTicks);
                if (soundEntry.wasEnded) entries.delete(soundEntry);
            }
            if (entries.size === 0) this._soundMap.delete(group);
        }
    }
    /**
    * Sets the listener (the point of hearing) for the sound system.
    * @param listener The entity providing position and orientation.
    */
    public setListener(listener: SoundListenerEntity) {
        this._listener = listener;
    }

    /**
     * @deprecated
     * Sets the base volume for all sounds.
     * @param gain Volume level (0.0 and above).
     */
    public setGlobalGain(gain: number) {
        for (const soundEntry of this._soundMap.allValues()) {
            soundEntry.updateBaseGain(gain);
        }
    }

    /**
     * Sets the base volume for a specific group of sounds.
     * @param group The name of the group.
     * @param gain Volume level (0.0 and above).
     */
    public setGroupGain(group: string, gain: number) {
        this._groupGainMap.set(group, gain);
        for (const soundEntry of this._soundMap.get(group) ?? []) {
            soundEntry.updateBaseGain(gain);
        }
    }

    /**
     * Adds a sound to the playback queue.
     * If the AudioContext is not yet active, the sound will be queued for playback once it is initialized.
     * @param soundEntry The sound entry to play.
     */
    public play<T extends SoundEntry>(soundEntry: T): T {
        if (this._isFullyInited()) {
            soundEntry.init(this);
            this._soundMap.add(soundEntry.options.group ?? DEFAULT_GROUP_NAME, soundEntry);
        } else {
            soundEntry._tryStartBeforeClick();
            this._initQueue.add(soundEntry);
        }
        return soundEntry;
    }

    /**
     * Pauses all sounds currently playing in the system.
     * @param pauseLevel Only sounds with a `pauseLevel` less than or equal to this will be paused.
     * @default Infinity
     */
    public pauseAll(pauseLevel: number = Infinity) {
        for (const soundEntry of this._soundMap.allValues()) {
            if (!soundEntry.canPauseAtLevel(pauseLevel)) continue;
            soundEntry.pause(this);
        }
    }
    /**
     * Resumes all paused sounds in the system.
     */
    public resumeAll() {
        for (const soundEntry of this._soundMap.allValues()) {
            soundEntry.play(this);
        }
    }
    /**
     * Registers a sound source to be loaded into the system.
     */
    public registerSource<T extends SoundSource>(soundSource: T): T {
        this._loadQueue.add(soundSource);
        return soundSource;
    }

    /**
     * Activates the AudioContext.
     * Must be called within a user interaction callback (like a click) to bypass browser auto-play restrictions.
     * This will also start decoding any queued sources and play any pending sound entries.
     */
    public async activeContext() {
        if (this.context != null) return;
        this.context = new AudioContext();
        await this.context.resume();

        for (const soundSource of this._decodeQueue) {
            await soundSource.decode(this.context);
        }
        this._decodeQueue.clear();

        for (const soundEntry of this._initQueue) {
            if (soundEntry._wasInited) continue;
            soundEntry.init(this);
            this._soundMap.add(soundEntry.options.group ?? DEFAULT_GROUP_NAME, soundEntry);
        }
        this._initQueue.clear();
        this._isFullyInitedFlag = true;
    }

    /**
     * a queue to load sound sources.
     * @internal
     */
    private _loadQueue = new Set<SoundSource>;
    /**
     * a queue to decode sound sources.
     * @internal
     */
    private _decodeQueue = new Set<SoundSource>;
    /**
     * a queue to initialization sound entries.
     * @internal
     */
    private _initQueue = new Set<SoundEntry>;
    /**
     * group to sound map.
     * @internal
     */
    private _soundMap = new MultiMap<string, SoundEntry>();
    /**
     * group to gain map.
     * @internal
     */
    public _groupGainMap = new Map<string, number>();


    /**@internal */
    private _listener?: SoundListenerEntity;

    /**@internal */
    private _lastEarPos = [0, 0, 0];

    /**@internal */
    private _lastEarOrient = [0, 1, 0];

    /**@internal */
    private _isFullyInitedFlag = false;

    /**@internal */
    public _isInited(): this is SoundSystem & { context: AudioContext } {
        return this.context != null;
    }

    /**@internal */
    public _isFullyInited(): this is SoundSystem & { context: AudioContext } {
        return this._isFullyInitedFlag && this.context != null;
    }

    /**@internal */
    public _getNextTickTime(): number {
        if (!this._isInited()) return 0;
        return this.context.currentTime + this.tps / 1000;
    }

    /**@internal */
    private _getSoundEarPos(optionalPartialTicks: number) {
        if (this._listener == null) return this._lastEarPos;
        const earPos = this._listener.getSoundEarPos(optionalPartialTicks);
        if (earPos.some(n => !isFinite(n))) return this._lastEarPos;
        return this._lastEarPos = earPos;
    }

    /**@internal */
    private _getSoundEarOrient(optionalPartialTicks: number) {
        if (this._listener == null) return this._lastEarOrient;
        const earOrient = this._listener.getSoundEarOrient(optionalPartialTicks);
        if (earOrient.some(n => !isFinite(n))) return this._lastEarOrient;
        return this._lastEarOrient = earOrient;
    }
}

/**
 * Represents an individual sound instance.
 * Manages dynamic parameters such as volume, pitch, and looping.
 * 
 * Node Graph: [SourceNode] -> [gainNode (local volume)] -> [baseGainNode (group/global volume)] -> [Destination]
 */
export class SoundEntry {
    protected source?: AudioBufferSourceNode;

    /** @deprecated use baseGainNode */
    protected get globalGainNode() {
        return this.baseGainNode;
    }

    /** @deprecated use baseGainNode */
    protected set globalGainNode(n: GainNode) {
        this.baseGainNode = n;
    }

    protected baseGainNode!: GainNode;
    protected gainNode!: GainNode;
    protected startTime = 0;
    protected pauseTime = 0;
    protected readonly pauseLevel: number;
    protected soundSystem!: SoundSystem;
    /**
     * True if the sound is currently playing.
     */
    public isPlaying = false;
    /**
     * True if the sound playback has finished.
     */
    public wasEnded = false;
    public options: SoundEntryOptions
    constructor(protected soundSource: SoundSource, optionsSrc?: SoundEntryOptions) {
        this.options = Object.assign(structuredClone(soundSource.options) ?? {}, optionsSrc);
        this.pauseLevel = this.options?.pauseLevel ?? 1;
    }

    /**
     * Sets the playback pitch (speed).
     * @param pitch Pitch multiplier (1.0 is default).
     */
    setPitch(pitch: number) {
        const time = this.soundSystem._getNextTickTime();
        this.source?.playbackRate.setValueAtTime(pitch, time);
    }
    /**
     * Sets the local volume (gain) for this specific entry.
     * @param gain Volume level (0.0 is silent).
     */
    setGain(gain: number): void {
        this.lastGain = gain;
        this._updateActualGain();
    }

    private _updateActualGain(): void {
        if (!this.gainNode) return;
        const time = this.soundSystem._getNextTickTime();
        const targetGain = this._isMuted ? 0 : this.lastGain;
        this.gainNode.gain.setTargetAtTime(targetGain, time, 0.01);
    }

    private lastGain = 1;
    private _isMuted = false;

    /**
     * Mutes or unmutes the sound.
     * @param isMute True to mute.
     */
    setMute(isMute: boolean = true): void {
        this._isMuted = isMute;
        this._updateActualGain();
    }

    /**
     * Creates the necessary audio nodes.
     * Can be overridden to add custom nodes like filters.
    */
    protected createNodes(audioCtx: AudioContext) {
        this.gainNode = audioCtx.createGain();
        this.baseGainNode = audioCtx.createGain();
    }

    /**
     * Connects the created audio nodes.
     * Can be overridden to change the connection path.
     */
    protected initNodes(audioCtx: AudioContext) {
        this.source?.connect(this.gainNode);
        this.gainNode?.connect(this.baseGainNode);
        this.baseGainNode.connect(audioCtx.destination);
    }

    /**
     * internal methods. do not call.
     */
    /**
     * Initializes the entry and starts playback.
     * @internal
     */
    init(soundSystem: SoundSystem) {
        this.soundSystem = soundSystem;
        if (!soundSystem._isInited()) throw new Error("soundSystem is not initializationed");

        if (this._tryStartedTime) {
            this.pauseTime = (performance.now() - this._tryStartedTime) / 1000;
        }
        this.createNodes(soundSystem.context);

        const groupGain = soundSystem._groupGainMap.get(this.options.group ?? DEFAULT_GROUP_NAME) ?? 1;
        this.updateBaseGain(groupGain);

        this.play(soundSystem);
        this._wasInited = true;
    }

    /**
     * Per-tick update logic.
     * @internal
     */
    updateTick(soundSystem: SoundSystem, optionalPartialTicks: number) {

    }

    /**@internal */
    play(soundSystem: SoundSystem) {
        if (this.isPlaying) return;
        const audioCtx = soundSystem.context;
        if (audioCtx == null) return;

        this.source = audioCtx.createBufferSource();
        this.source.buffer = this.soundSource.getAudioBuffer();

        this.source.loop = this.options?.loop ?? false;

        this.initNodes(audioCtx);

        this.startTime = audioCtx.currentTime - this.pauseTime;
        this.isPlaying = true;
        this.wasEnded = false;

        if (this.pauseTime > 0) {
            this.source.start(0, this.pauseTime);
        } else {
            this.source.start();
        }

        this.source.onended = () => {
            // pause() によって停止された場合は isPlaying が false になっている
            if (this.isPlaying) {
                this.isPlaying = false;
                this.pauseTime = 0;
                this.wasEnded = true;
            }
        };

        this.setGain(this.options?.gain ?? 1);
        this.setPitch(this.options?.pitch ?? 1);
    }

    /**@internal this can be overritten*/
    canPauseAtLevel(level: number) {
        return level >= this.pauseLevel;
    }

    /**@internal */
    pause(soundSystem: SoundSystem) {
        if (!this.isPlaying) return;
        const audioCtx = soundSystem.context;
        if (audioCtx == null) return;

        this.source?.stop();
        this.pauseTime = audioCtx.currentTime - this.startTime;
        this.isPlaying = false;
    }

    /**@internal */
    stop(soundSystem: SoundSystem) {
        if (!this.isPlaying) return;

        this.source?.stop();
        this.pauseTime = 0;
        this.isPlaying = false;
        this.wasEnded = true;
    }

    /**
     * Called when global or group gain changes.
     * @internal
     */
    updateBaseGain(gain: number) {
        const time = this.soundSystem._getNextTickTime();
        this.baseGainNode.gain.setValueAtTime(gain, time);
    }


    /**
     * Records the attempt time to play a sound before AudioContext is active.
     * Used to sync playback start point once initialized.
     * @internal
     */
    _tryStartBeforeClick() {
        this._tryStartedTime = performance.now();
    }
    private _tryStartedTime: number | undefined = undefined;
    _wasInited = false;
}

/**
 * Abstract class for sound entries that have a 3D position in space.
 * 
 * Node Graph: [SourceNode] -> [PannerNode] -> [gainNode] -> [baseGainNode] -> [Destination]
 */
export abstract class AbstractSoundEntryPositioned extends SoundEntry {
    protected pannerNode!: PannerNode;

    /** @internal */
    override updateTick(soundSystem: SoundSystem, optionalPartialTicks: number): void {
        if (!soundSystem._isInited()) return;

        super.updateTick(soundSystem, optionalPartialTicks);
        const pos = this.getSoundSourcePos(optionalPartialTicks);
        const orient = this.getSoundSourceOrient(optionalPartialTicks);
        const time = soundSystem._getNextTickTime();
        if (this.pannerNode.positionX) {
            this.pannerNode.positionX.setValueAtTime(pos[0], time);
            this.pannerNode.positionY.setValueAtTime(pos[1], time);
            this.pannerNode.positionZ.setValueAtTime(pos[2], time);
            this.pannerNode.orientationX.setValueAtTime(orient[0], time);
            this.pannerNode.orientationY.setValueAtTime(orient[1], time);
            this.pannerNode.orientationZ.setValueAtTime(orient[2], time);
        } else {
            this.pannerNode.setPosition(pos[0], pos[1], pos[2]);
            this.pannerNode.setOrientation(orient[0], orient[1], orient[2]);
        }
    }
    /** @internal */
    protected override createNodes(audioCtx: AudioContext): void {
        this.pannerNode = audioCtx.createPanner();

        this.pannerNode.panningModel = this.soundSource.options?.panningModel ?? "HRTF";
        this.pannerNode.distanceModel = this.soundSource.options?.distanceModel ?? "inverse";

        this.pannerNode.refDistance = this.soundSource.options?.refDistance ?? 1;
        this.pannerNode.maxDistance = this.soundSource.options?.maxDistance ?? 10000;
        this.pannerNode.rolloffFactor = this.soundSource.options?.rolloffFactor ?? 1;
        super.createNodes(audioCtx);
    }
    /** @internal */
    protected override initNodes(audioCtx: AudioContext): void {
        this.source?.connect(this.pannerNode);
        this.pannerNode.connect(this.gainNode);
        this.gainNode.connect(this.baseGainNode);
        this.baseGainNode.connect(audioCtx.destination);
    }
    abstract getSoundSourcePos(optionalPartialTicks: number): vec3;
    abstract getSoundSourceOrient(optionalPartialTicks: number): vec3;

    /**@internal */
    override play(soundSystem: SoundSystem): void {
        this._wasMutedDueToScreenHide = false;
        super.play(soundSystem);
    }
    /**@internal */
    override pause(soundSystem: SoundSystem): void {
        this._wasMutedDueToScreenHide = false;
        super.pause(soundSystem);
    }
    /** @internal */
    override init(soundSystem: SoundSystem): void {
        super.init(soundSystem);
        this._checkScreenHideAndMute();
    }

    /**@internal */
    private _wasMutedDueToScreenHide = false;
    /**
     * Mutes sounds when the browser tab is hidden to save resources or match user expectation.
     * @internal
     */
    /**@internal */
    _checkScreenHideAndMute() {
        if (document.hidden) {
            if (!this.isPlaying) return;
            this.setMute(true);
            this._wasMutedDueToScreenHide = true;
            //console.log("wasMutedDueToScreenHide");
        } else {
            if (!this._wasMutedDueToScreenHide) return;
            this._wasMutedDueToScreenHide = false;
            if (!this.isPlaying) return;
            this.setMute(false);
            //console.log("wasUnmutedDueToScreenHide");
        }
    }
}

/**
 * A sound entry with a fixed 3D coordinate.
 */
export class SoundEntryPositioned extends AbstractSoundEntryPositioned {
    protected pos: vec3;
    protected orient: vec3;
    constructor(src: SoundSource, x: number, y: number, z: number, orientX: number = 0, orientY: number = 0, orientZ: number = 0, options?: SoundEntryOptions) {
        super(src, options);
        this.pos = [x, y, z];
        this.orient = [orientX, orientY, orientZ];
    }
    override getSoundSourcePos(optionalPartialTicks: number): vec3 {
        return this.pos;
    }
    override getSoundSourceOrient(optionalPartialTicks: number): vec3 {
        return this.orient;
    }
}

/**
 * A sound entry that tracks a dynamic entity.
 */
export class SoundEntryPositionedEntity extends AbstractSoundEntryPositioned {
    constructor(src: SoundSource, protected srcEntity: SoundSourceEntity, options?: SoundEntryOptions) {
        super(src, options);
    }
    override getSoundSourcePos(optionalPartialTicks: number): vec3 {
        return this.srcEntity.getSoundSourcePos(optionalPartialTicks);
    }
    override getSoundSourceOrient(optionalPartialTicks: number): vec3 {
        return this.srcEntity.getSoundSourceOrient(optionalPartialTicks);
    }
}

/**
 * Abstract class representing the source of audio data (URL, Base64, Blob, etc.).
 */
export abstract class SoundSource {
    protected audioBuffer?: AudioBuffer;
    protected arrayBuffer?: ArrayBuffer;
    constructor(public options?: SoundSourceOptions) { }
    /**
    * Loads the sound source.
    * @returns The decoded audio buffer.
    */
    abstract load(): Promise<ArrayBuffer>;
    /**
    * Decodes the sound source.
    * @param context The audio context to decode the sound source.
    * @returns The decoded audio buffer.
    */
    async decode(context: AudioContext): Promise<AudioBuffer> {
        if (this.audioBuffer) return this.audioBuffer;
        if (this.arrayBuffer == null) {
            throw new Error("Array Buffer not loaded. Call load() first.");
        }
        const buffer = await context.decodeAudioData(this.arrayBuffer);
        this.arrayBuffer = undefined; // デコード後は不要なためメモリ解放
        return this.audioBuffer = buffer;
    }

    public wasDecoded(): boolean {
        return this.audioBuffer != null;
    }
    public getAudioBuffer(): AudioBuffer {
        if (this.audioBuffer == null) {
            throw new Error("Audio Buffer not loaded. Call decode() first.");
        }
        return this.audioBuffer;
    }
}

export class SoundSourceUrl extends SoundSource {
    /**
     * A sound source that is a audio source.
     * @param src The audio source.
     */
    constructor(private src: string, options?: SoundSourceOptions) { super(options) }
    /**
     * Loads the sound source.
     * @param context The audio context to decode the sound source.
     * @returns The decoded audio buffer.
     */
    async load(): Promise<ArrayBuffer> {
        const response = await fetch(this.src);
        return this.arrayBuffer = await response.arrayBuffer();
    }
}

export class SoundSourceBase64 extends SoundSource {
    /**
     * A sound source that is a audio source.
     * @param src The audio source.
     */
    constructor(private src: string, options?: SoundSourceOptions) { super(options) }
    /**
     * Loads the sound source.
     * @param context The audio context to decode the sound source.
     * @returns The decoded audio buffer.
     */
    async load(): Promise<ArrayBuffer> {
        return this.arrayBuffer = decodeBase64ArrayBuffer(this.src);

    }
}

export class SoundSourceBlob extends SoundSource {
    /**
     * A sound source that is a audio source.
     * @param src The audio source.
     */
    constructor(private src: Blob, options?: SoundSourceOptions) { super(options) }
    /**
     * Loads the sound source.
     * @param context The audio context to decode the sound source.
     * @returns The decoded audio buffer.
     */
    async load(): Promise<ArrayBuffer> {
        return this.arrayBuffer = await decodeBlobArrayBuffer(this.src);
    }
}

type vec3 = [number, number, number];

export interface SoundSourceEntity {
    getSoundSourcePos(optionalPartialTicks: number): vec3
    getSoundSourceOrient(optionalPartialTicks: number): vec3
}
export interface SoundListenerEntity {
    getSoundEarPos(optionalPartialTicks: number): vec3
    getSoundEarOrient(optionalPartialTicks: number): vec3
}

export interface SoundEntryOptions extends SoundSourceOptions {
    /**@default 1 */
    pauseLevel?: number;
    /**@default false */
    loop?: boolean;
}

export interface SoundSourceOptions {
    panningModel?: PanningModelType;
    /**@default "inverse" */
    distanceModel?: DistanceModelType;
    /**@default 1 */
    refDistance?: number;
    /**@default 10000 */
    maxDistance?: number;
    /**@default 1 */
    rolloffFactor?: number;
    /**@default 1 */
    gain?: number;
    /**@default 1 */
    pitch?: number;
    /**@default "default" */
    group?: string;
}


export interface SoundSystemOptions {
    tps?: number;
    /**@default 0 */
    pauseOnScreenHide?: boolean;
    /**@default false */
}
