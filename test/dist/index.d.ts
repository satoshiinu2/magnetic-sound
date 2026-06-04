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
export declare class SoundSystem {
    tps: number;
    /**
     * a queue to load sound sources.
     */
    private loadQueue;
    /**
     * a queue to decode sound sources.
     */
    private decodeQueue;
    /**
     * a queue to initialization sound entries.
     */
    private initQueue;
    /**
     * actived sounds set.
     */
    private sounds;
    context?: AudioContext;
    private listener?;
    private lastEarPos;
    private lastEarOrient;
    /**
     * @param tps tps to interpolation timings. if you don't use interpolation set 0.
     */
    constructor(tps?: number);
    /**
     * load or fetch sources
     */
    loadAllQueuedSources(): Promise<ArrayBuffer[]>;
    /**
     * Update the sound system.
     * @param optionalPartialTicks the partial ticks to use for callback
     * @default 1
      */
    updateTick(optionalPartialTicks?: number): void;
    getNextTickTime(): number;
    private getSoundEarPos;
    private getSoundEarOrient;
    /**
    * set the listener for the sound system.
    * @param listener the listener to set for the sound system.
    */
    setListener(listener: SoundListenerEntity): void;
    /**
     * play sound to the sound system.
     * @param soundEntry sound to play in the sound system.
     */
    play(soundEntry: SoundEntry): void;
    /**
     * plays all sounds in the sound system.
     * @param pauseLevel The level at which the sound can be paused.
     * @default Infinity
     */
    pauseAll(pauseLevel?: number): void;
    /**
     * replays all sounds in the sound system.
     */
    resumeAll(): void;
    /**
     * Registers the sound source to load.
     */
    registerSource<T extends SoundSource>(soundSource: T): T;
    wasInited(): this is SoundSystem & {
        context: AudioContext;
    };
    private onclick;
}
export declare class SoundEntry {
    protected soundSource: SoundSource;
    protected options?: SoundEntryOptions | undefined;
    protected source?: AudioBufferSourceNode;
    protected gainNode: GainNode;
    protected startTime: number;
    protected pauseTime: number;
    protected readonly pauseLevel: number;
    protected soundSystem: SoundSystem;
    /**
     * seted true when playing
     */
    isPlaying: boolean;
    /**
     * seted true when ended;
     */
    wasEnded: boolean;
    constructor(soundSource: SoundSource, options?: SoundEntryOptions | undefined);
    /**
     * set sound pitch (speed)
     * @param pitch pitch to set
     */
    setPitch(pitch: number): void;
    /**
     * set sound gain (volume)
     * @param gain gain to set
     */
    setGain(gain: number): void;
    /**
     * Creates the audio nodes for the sound entry.
     */
    protected createNodes(audioCtx: AudioContext): void;
    /**
     * Initializes the audio nodes for the sound entry.
     */
    protected initNodes(audioCtx: AudioContext): void;
    /**
     * internal methods. do not call.
     */
    /**@deprecated internal method */
    init(soundSystem: SoundSystem): void;
    /**
     * for timing adjustment
     * @deprecated internal method
     */
    tryStartBeforeClick(): void;
    private tryStartedTime;
    wasInited: boolean;
    /**@deprecated internal method */
    updateTick(soundSystem: SoundSystem, optionalPartialTicks: number): void;
    /**@deprecated internal method */
    play(soundSystem: SoundSystem): void;
    /**@deprecated internal method */
    canPauseAtLevel(level: number): boolean;
    /**@deprecated internal method */
    pause(soundSystem: SoundSystem): void;
    /**@deprecated internal method */
    stop(soundSystem: SoundSystem): void;
}
export declare abstract class AbstractSoundEntryPositioned extends SoundEntry {
    protected pannerNode: PannerNode;
    /**@deprecated internal method */
    updateTick(soundSystem: SoundSystem, optionalPartialTicks: number): void;
    protected createNodes(audioCtx: AudioContext): void;
    protected initNodes(audioCtx: AudioContext): void;
    abstract getSoundSourcePos(optionalPartialTicks: number): vec3;
    abstract getSoundSourceOrient(optionalPartialTicks: number): vec3;
}
export declare class SoundEntryPositioned extends AbstractSoundEntryPositioned {
    protected pos: vec3;
    protected orient: vec3;
    constructor(src: SoundSource, x: number, y: number, z: number, xUp?: number, yUp?: number, zUp?: number, options?: SoundEntryOptions);
    getSoundSourcePos(optionalPartialTicks: number): vec3;
    getSoundSourceOrient(optionalPartialTicks: number): vec3;
}
export declare class SoundEntryPositionedEntity extends AbstractSoundEntryPositioned {
    protected srcEntity: SoundSourceEntity;
    constructor(src: SoundSource, srcEntity: SoundSourceEntity, options?: SoundEntryOptions);
    getSoundSourcePos(optionalPartialTicks: number): vec3;
    getSoundSourceOrient(optionalPartialTicks: number): vec3;
}
export declare abstract class SoundSource {
    options?: SoundSourceOptions | undefined;
    protected audioBuffer?: AudioBuffer;
    protected arrayBuffer?: ArrayBuffer;
    constructor(options?: SoundSourceOptions | undefined);
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
    decode(context: AudioContext): Promise<AudioBuffer>;
    wasDecoded(): boolean;
    getAudioBuffer(): AudioBuffer;
}
export declare class SoundSourceUrl extends SoundSource {
    private src;
    /**
     * A sound source that is a audio source.
     * @param src The audio source.
     */
    constructor(src: string, options?: SoundSourceOptions);
    /**
     * Loads the sound source.
     * @param context The audio context to decode the sound source.
     * @returns The decoded audio buffer.
     * @deprecated internal method
     */
    load(): Promise<ArrayBuffer>;
}
export declare class SoundSourceBase64 extends SoundSource {
    private src;
    /**
     * A sound source that is a audio source.
     * @param src The audio source.
     */
    constructor(src: string, options?: SoundSourceOptions);
    /**
     * Loads the sound source.
     * @param context The audio context to decode the sound source.
     * @returns The decoded audio buffer.
     * @deprecated internal method
     */
    load(): Promise<ArrayBuffer>;
}
export declare class SoundSourceBlob extends SoundSource {
    private src;
    /**
     * A sound source that is a audio source.
     * @param src The audio source.
     */
    constructor(src: Blob, options?: SoundSourceOptions);
    /**
     * Loads the sound source.
     * @param context The audio context to decode the sound source.
     * @returns The decoded audio buffer.
     * @deprecated internal method
     */
    load(): Promise<ArrayBuffer>;
}
type vec3 = [number, number, number];
export interface SoundSourceEntity {
    getSoundSourcePos(optionalPartialTicks: number): vec3;
    getSoundSourceOrient(optionalPartialTicks: number): vec3;
}
export interface SoundListenerEntity {
    getSoundEarPos(optionalPartialTicks: number): vec3;
    getSoundEarOrient(optionalPartialTicks: number): vec3;
}
export interface SoundEntryOptions {
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
}
export { };
