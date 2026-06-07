export declare class SoundSystem {
    tps: number;
    /**
     * a context of web audio api.
     */
    context?: AudioContext;
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
     * @param optionalPartialTicks the partial ticks to callback
     * @default 1
      */
    updateTick(optionalPartialTicks?: number): void;
    /**
    * set the listener for the sound system.
    * @param listener the listener to set for the sound system.
    */
    setListener(listener: SoundListenerEntity): void;
    /**
     * @deprecated
     * set the global gain (volume)
     * @param gain gain to set
     */
    setGlobalGain(gain: number): void;
    /**
     * set the global gain (volume)
     * @param gain gain to set
     */
    setGroupGain(group: string, gain: number): void;
    /**
     * play sound to the sound system.
     * @param {SoundEntry} soundEntry sound to play in the sound system.
     */
    play<T extends SoundEntry>(soundEntry: T): T;
    /**
     * plays all sounds in the sound system.
     * @param {number} pauseLevel The level at which the sound can be paused.
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
}
export declare class SoundEntry {
    protected soundSource: SoundSource;
    protected source?: AudioBufferSourceNode;
    /** @deprecated use baseGainNode */
    protected get globalGainNode(): GainNode;
    /** @deprecated use baseGainNode */
    protected set globalGainNode(n: GainNode);
    protected baseGainNode: GainNode;
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
    options: SoundEntryOptions;
    constructor(soundSource: SoundSource, optionsSrc?: SoundEntryOptions);
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
    private lastGain;
    /**
     * mute sound
     * @param isMute gain to set
     * @default true
     */
    setMute(isMute?: boolean): void;
    /**
     * Creates the audio nodes for the sound entry.
     * internal method this can be overritten
    */
    protected createNodes(audioCtx: AudioContext): void;
    /**
     * Initializes the audio nodes for the sound entry.
     * internal method this can be overritten
     */
    protected initNodes(audioCtx: AudioContext): void;
    /**
     * internal methods. do not call.
     */
    /**internal method this can be overritten */
    init(soundSystem: SoundSystem): void;
    /**internal method this can be overritten*/
    updateTick(soundSystem: SoundSystem, optionalPartialTicks: number): void;
    private _tryStartedTime;
    _wasInited: boolean;
}
export declare abstract class AbstractSoundEntryPositioned extends SoundEntry {
    protected pannerNode: PannerNode;
    /**internal method this can be overritten */
    updateTick(soundSystem: SoundSystem, optionalPartialTicks: number): void;
    /**internal method this can be overritten */
    protected createNodes(audioCtx: AudioContext): void;
    /**internal method this can be overritten */
    protected initNodes(audioCtx: AudioContext): void;
    abstract getSoundSourcePos(optionalPartialTicks: number): vec3;
    abstract getSoundSourceOrient(optionalPartialTicks: number): vec3;
    /**internal method this can be overritten */
    init(soundSystem: SoundSystem): void;
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
}
export declare class SoundSourceBase64 extends SoundSource {
    private src;
    /**
     * A sound source that is a audio source.
     * @param src The audio source.
     */
    constructor(src: string, options?: SoundSourceOptions);
}
export declare class SoundSourceBlob extends SoundSource {
    private src;
    /**
     * A sound source that is a audio source.
     * @param src The audio source.
     */
    constructor(src: Blob, options?: SoundSourceOptions);
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
}
export {};
