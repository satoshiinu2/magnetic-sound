import { decodeBase64ArrayBuffer, decodeBlobArrayBuffer } from "./util";

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
console.info("Magnetic Sound was loaded!");
export class SoundSystem {
    /**
     * a context of web audio api.
     */
    public context?: AudioContext;

    /**
     * @param tps tps to interpolation timings. if you don't use interpolation set 0.
     */
    constructor(public tps: number = 0) {
        document.addEventListener("click", this.onclick.bind(this));

        document.addEventListener('visibilitychange', () => {
            for (const soundEntry of this._sounds) {
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
     * load or fetch sources
     */
    public async loadAllQueuedSources() {
        const promises = Array.from(this._loadQueue).map(async source => {
            const result = await source.load();

            if (this.wasInited()) {
                await source.decode(this.context);
            } else {
                this._decodeQueue.add(source);
            }

            this._loadQueue.delete(source);
            return result;
        });
        return await Promise.all(promises);
    }

    /**
     * Update the sound system.
     * @param optionalPartialTicks the partial ticks to callback
     * @default 1
      */
    public updateTick(optionalPartialTicks = 1): void {
        if (!this.wasInited()) return;
        const pos = this.getSoundEarPos(optionalPartialTicks);
        const orient = this.getSoundEarOrient(optionalPartialTicks);
        const time = this.getNextTickTime();
        if (typeof this.context.listener.positionX !== "undefined") {
            this.context.listener.positionX.setValueAtTime(pos[0], time);
            this.context.listener.positionY.setValueAtTime(pos[1], time);
            this.context.listener.positionZ.setValueAtTime(pos[2], time);
            this.context.listener.forwardX.setValueAtTime(orient[0], time);
            this.context.listener.forwardY.setValueAtTime(orient[1], time);
            this.context.listener.forwardZ.setValueAtTime(orient[2], time);
        } else {
            this.context.listener.setOrientation(pos[0], pos[1], pos[2], orient[0], orient[1], orient[2]);
        }

        for (const soundEntry of this._sounds) {
            soundEntry.updateTick(this, optionalPartialTicks);
            if (soundEntry.wasEnded) this._sounds.delete(soundEntry);
        }
    }
    /**
    * set the listener for the sound system.
    * @param listener the listener to set for the sound system.
    */
    public setListener(listener: SoundListenerEntity) {
        this._listener = listener;
    }

    /**
     * set the global gain (volume)
     * @param gain gain to set
     */
    public setGlobalGain(gain: number) {
        this._globalGain = gain;
        for (const soundEntry of this._sounds) {
            soundEntry.updateGlobalGain(gain);
        }
    }

    /**
     * play sound to the sound system.
     * @param {SoundEntry} soundEntry sound to play in the sound system.
     */
    public play<T extends SoundEntry>(soundEntry: T): T {
        if (this.wasAllInited()) {
            soundEntry.init(this);
            this._sounds.add(soundEntry);
        } else {
            soundEntry._tryStartBeforeClick();
            this._initQueue.add(soundEntry);
        }
        return soundEntry;
    }

    /**
     * plays all sounds in the sound system.
     * @param {number} pauseLevel The level at which the sound can be paused.
     * @default Infinity
     */
    public pauseAll(pauseLevel: number = Infinity) {
        for (const soundEntry of this._sounds) {
            if (!soundEntry.canPauseAtLevel(pauseLevel)) continue;
            soundEntry.pause(this);
        }
    }
    /**
     * replays all sounds in the sound system.
     */
    public resumeAll() {
        for (const soundEntry of this._sounds) {
            soundEntry.play(this);
        }
    }
    /**
     * Registers the sound source to load.
     */
    public registerSource<T extends SoundSource>(soundSource: T): T {
        this._loadQueue.add(soundSource);
        return soundSource;
    }


    /**
     * internal methods. do not call.
     */

    /**
     * a queue to load sound sources.
     * @deprecated internal property
     */
    private _loadQueue = new Set<SoundSource>;
    /**
     * a queue to decode sound sources.
     * @deprecated internal property
     */
    private _decodeQueue = new Set<SoundSource>;
    /**
     * a queue to initialization sound entries.
     * @deprecated internal property
     */
    private _initQueue = new Set<SoundEntry>;
    /**
     * actived sounds set.
     * @deprecated internal property
     */
    private _sounds = new Set<SoundEntry>;


    /**@deprecated internal property */
    private _listener?: SoundListenerEntity;

    /**@deprecated internal property */
    private _lastEarPos = [0, 0, 0];

    /**@deprecated internal property */
    private _lastEarOrient = [0, 1, 0];

    /**@deprecated internal property */
    private _globalGain = 1.0;

    /**@deprecated internal property */
    private _wasAllInitedFlag = false;

    /**@deprecated internal method */
    public wasInited(): this is SoundSystem & { context: AudioContext } {
        return this.context != null;
    }

    /**@deprecated internal method */
    public wasAllInited(): this is SoundSystem & { context: AudioContext } {
        return this._wasAllInitedFlag && this.context != null;
    }

    /**@deprecated internal method */
    public getNextTickTime(): number {
        if (!this.wasInited()) return 0;
        return this.context.currentTime + this.tps / 1000;
    }

    /**@deprecated internal method */
    private async onclick() {
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
            this._sounds.add(soundEntry);
        }
        this._initQueue.clear();
        this._wasAllInitedFlag = true;
    }

    /**@deprecated internal method */
    private getSoundEarPos(optionalPartialTicks: number) {
        if (this._listener == null) return this._lastEarPos;
        const earPos = this._listener.getSoundEarPos(optionalPartialTicks);
        if (earPos.some(n => !isFinite(n))) return this._lastEarPos;
        return this._lastEarPos = earPos;
    }

    /**@deprecated internal method */
    private getSoundEarOrient(optionalPartialTicks: number) {
        if (this._listener == null) return this._lastEarOrient;
        const earOrient = this._listener.getSoundEarOrient(optionalPartialTicks);
        if (earOrient.some(n => !isFinite(n))) return this._lastEarOrient;
        return this._lastEarOrient = earOrient;
    }
}

export class SoundEntry {
    protected source?: AudioBufferSourceNode;
    protected globalGainNode!: GainNode;
    protected gainNode!: GainNode;
    protected startTime = 0;
    protected pauseTime = 0;
    protected readonly pauseLevel: number;
    protected soundSystem!: SoundSystem;
    /**
     * seted true when playing 
     */
    public isPlaying = false;
    /**
     * seted true when ended;
     */
    public wasEnded = false;
    protected options: SoundEntryOptions
    constructor(protected soundSource: SoundSource, optionsSrc?: SoundEntryOptions) {
        this.options = Object.assign(structuredClone(soundSource.options) ?? {}, optionsSrc);
        this.pauseLevel = this.options?.pauseLevel ?? 1;
    }

    /**
     * set sound pitch (speed)
     * @param pitch pitch to set
     */
    setPitch(pitch: number) {
        const time = this.soundSystem.getNextTickTime();
        this.source?.playbackRate.setValueAtTime(pitch, time);
    }
    /**
     * set sound gain (volume)
     * @param gain gain to set
     */
    setGain(gain: number) {
        const time = this.soundSystem.getNextTickTime();
        this.gainNode.gain.setTargetAtTime(gain, time, 0.01);
        this.lastGain = gain;
    }
    private lastGain = 1;

    /**
     * mute sound
     * @param isMute gain to set
     * @default true
     */
    setMute(isMute: boolean = true) {
        const time = this.soundSystem.getNextTickTime();
        const gain = isMute ? 0 : this.lastGain;
        this.gainNode.gain.setTargetAtTime(gain, time, 0.01);
    }

    /**
     * Creates the audio nodes for the sound entry.
     * internal method this can be overritten 
    */
    protected createNodes(audioCtx: AudioContext) {
        this.gainNode = audioCtx.createGain();
        this.globalGainNode = audioCtx.createGain();
    }

    /**
     * Initializes the audio nodes for the sound entry.
     * internal method this can be overritten 
     */
    protected initNodes(audioCtx: AudioContext) {
        this.source?.connect(this.gainNode);
        this.gainNode?.connect(this.globalGainNode);
        this.globalGainNode.connect(audioCtx.destination);
    }

    /**
     * internal methods. do not call.
     */
    /**internal method this can be overritten */
    init(soundSystem: SoundSystem) {
        this.soundSystem = soundSystem;
        if (!soundSystem.wasInited()) throw new Error("soundSystem is not initializationed");

        if (this._tryStartedTime) {
            this.pauseTime = (performance.now() - this._tryStartedTime) / 1000;
        }
        this.createNodes(soundSystem.context);
        this.play(soundSystem);
        this._wasInited = true;
    }

    /**internal method this can be overritten*/
    updateTick(soundSystem: SoundSystem, optionalPartialTicks: number) {

    }

    /**@deprecated internal method */
    play(soundSystem: SoundSystem) {
        if (this.isPlaying) return;
        const audioCtx = soundSystem.context;
        if (audioCtx == null) return;

        this.source = audioCtx.createBufferSource();
        this.source.buffer = this.soundSource.getAudioBuffer();

        this.source.loop = this.options?.loop ?? false;

        this.initNodes(audioCtx);

        this.startTime = audioCtx.currentTime - this.pauseTime;

        if (this.pauseTime > 0) {
            this.source.start(0, this.pauseTime);
        } else {
            this.source.start();
        }
        this.isPlaying = true;
        this.wasEnded = false;

        this.source.onended = () => {
            this.isPlaying = false;
            this.pauseTime = 0;
            this.wasEnded = true;
        }


        this.setGain(this.options?.gain ?? 1);
        this.setPitch(this.options?.pitch ?? 1);
    }

    /**@deprecated internal method this can be overritten*/
    canPauseAtLevel(level: number) {
        return level >= this.pauseLevel;
    }

    /**@deprecated internal method */
    pause(soundSystem: SoundSystem) {
        if (!this.isPlaying) return;
        const audioCtx = soundSystem.context;
        if (audioCtx == null) return;

        this.source?.stop();
        this.pauseTime = audioCtx.currentTime - this.startTime;
        this.isPlaying = false;
    }

    /**@deprecated internal method */
    stop(soundSystem: SoundSystem) {
        if (!this.isPlaying) return;

        this.source?.stop();
        this.pauseTime = 0;
        this.isPlaying = false;
    }

    /**@deprecated internal method */
    updateGlobalGain(gain: number) {
        const time = this.soundSystem.getNextTickTime();
        this.globalGainNode.gain.setValueAtTime(gain, time);
    }


    /**
     * for timing adjustment
     * @deprecated internal method
     */
    _tryStartBeforeClick() {
        this._tryStartedTime = performance.now();
    }
    private _tryStartedTime: number | undefined = undefined;
    _wasInited = false;
}

export abstract class AbstractSoundEntryPositioned extends SoundEntry {
    protected pannerNode!: PannerNode;

    /**internal method this can be overritten */
    override updateTick(soundSystem: SoundSystem, optionalPartialTicks: number): void {
        if (!soundSystem.wasInited()) return;

        super.updateTick(soundSystem, optionalPartialTicks);
        const pos = this.getSoundSourcePos(optionalPartialTicks);
        const orient = this.getSoundSourceOrient(optionalPartialTicks);
        const time = soundSystem.getNextTickTime();
        this.pannerNode.positionX.setValueAtTime(pos[0], time);
        this.pannerNode.positionY.setValueAtTime(pos[1], time);
        this.pannerNode.positionZ.setValueAtTime(pos[2], time);
        this.pannerNode.orientationX.setValueAtTime(orient[0], time);
        this.pannerNode.orientationY.setValueAtTime(orient[1], time);
        this.pannerNode.orientationZ.setValueAtTime(orient[2], time);
    }
    /**internal method this can be overritten */
    protected override createNodes(audioCtx: AudioContext): void {
        this.pannerNode = audioCtx.createPanner();

        this.pannerNode.panningModel = this.soundSource.options?.panningModel ?? "HRTF";
        this.pannerNode.distanceModel = this.soundSource.options?.distanceModel ?? "inverse";

        this.pannerNode.refDistance = this.soundSource.options?.refDistance ?? 1;
        this.pannerNode.maxDistance = this.soundSource.options?.maxDistance ?? 10000;
        this.pannerNode.rolloffFactor = this.soundSource.options?.rolloffFactor ?? 1;
        super.createNodes(audioCtx);
    }
    /**internal method this can be overritten */
    protected override initNodes(audioCtx: AudioContext): void {
        this.source?.connect(this.pannerNode);
        this.pannerNode.connect(this.gainNode);
        this.gainNode.connect(this.globalGainNode);
        this.globalGainNode.connect(audioCtx.destination);
    }
    abstract getSoundSourcePos(optionalPartialTicks: number): vec3;
    abstract getSoundSourceOrient(optionalPartialTicks: number): vec3;

    /**@deprecated internal method */
    override play(soundSystem: SoundSystem): void {
        this._wasMutedDueToScreenHide = false;
        super.play(soundSystem);
    }
    /**@deprecated internal method */
    override pause(soundSystem: SoundSystem): void {
        this._wasMutedDueToScreenHide = false;
        super.pause(soundSystem);
    }
    /**internal method this can be overritten */
    override init(soundSystem: SoundSystem): void {
        super.init(soundSystem);
        this._checkScreenHideAndMute();
    }

    /**@deprecated internal property */
    private _wasMutedDueToScreenHide = false;
    /**@deprecated internal method */
    _checkScreenHideAndMute() {
        if (document.hidden) {
            if (!this.isPlaying) return;
            this.setMute(true);
            this._wasMutedDueToScreenHide = true;
            //console.log("wasMutedDueToScreenHide");
        } else {
            if (!this._wasMutedDueToScreenHide) return;
            if (this.isPlaying) return;
            this.setMute(false);
            //console.log("wasUnmutedDueToScreenHide");
        }
    }
}

export class SoundEntryPositioned extends AbstractSoundEntryPositioned {
    protected pos: vec3;
    protected orient: vec3;
    constructor(src: SoundSource, x: number, y: number, z: number, xUp: number = 0, yUp: number = 0, zUp: number = 0, options?: SoundEntryOptions) {
        super(src, options);
        this.pos = [x, y, z];
        this.orient = [xUp, yUp, zUp];
    }
    override getSoundSourcePos(optionalPartialTicks: number): vec3 {
        return this.pos;
    }
    override getSoundSourceOrient(optionalPartialTicks: number): vec3 {
        return this.orient;
    }
}

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
        if (this.arrayBuffer == null) {
            throw new Error("Array Buffer not loaded. Call load() first.");
        }
        return this.audioBuffer = await context.decodeAudioData(this.arrayBuffer);
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
     * @deprecated internal method
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
     * @deprecated internal method
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
     * @deprecated internal method
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
}


export interface SoundSystemOptions {
    tps?: number;
    /**@default 0 */
    pauseOnScreenHide?: boolean;
    /**@default false */
}
