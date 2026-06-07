/**
 * The main class that manages the Web Audio API, sound playback, loading, and listener state updates.
 * It includes automatic resumption of the AudioContext to comply with browser auto-play policies.
 */
export declare class SoundSystem {
    tps: number;
    /**
     * The Web Audio API Context.
     */
    context?: AudioContext;
    /**
     * Initializes the SoundSystem.
     * @param tps Ticks Per Second used for timing interpolation. Set to 0 to disable interpolation.
     */
    constructor(tps?: number);
    /**
     * Loads all registered sound sources and starts decoding them if the context is initialized.
     * @returns A promise resolving to an array of load results.
     */
    loadAllQueuedSources(): Promise<ArrayBuffer[]>;
    /**
     * Updates the sound system state. This should be called every frame.
     * Updates the listener's position and cleans up finished sound entries.
     * @param optionalPartialTicks The progress between ticks for interpolation (0.0 to 1.0).
     * @default 1
     */
    updateTick(optionalPartialTicks?: number): void;
    /**
    * Sets the listener (the point of hearing) for the sound system.
    * @param listener The entity providing position and orientation.
    */
    setListener(listener: SoundListenerEntity): void;
    /**
     * @deprecated
     * Sets the base volume for all sounds.
     * @param gain Volume level (0.0 and above).
     */
    setGlobalGain(gain: number): void;
    /**
     * Sets the base volume for a specific group of sounds.
     * @param group The name of the group.
     * @param gain Volume level (0.0 and above).
     */
    setGroupGain(group: string, gain: number): void;
    /**
     * Adds a sound to the playback queue.
     * If the AudioContext is not yet active, the sound will be queued for playback once it is initialized.
     * @param soundEntry The sound entry to play.
     */
    play<T extends SoundEntry>(soundEntry: T): T;
    /**
     * Pauses all sounds currently playing in the system.
     * @param pauseLevel Only sounds with a `pauseLevel` less than or equal to this will be paused.
     * @default Infinity
     */
    pauseAll(pauseLevel?: number): void;
    /**
     * Resumes all paused sounds in the system.
     */
    resumeAll(): void;
    /**
     * Registers a sound source to be loaded into the system.
     */
    registerSource<T extends SoundSource>(soundSource: T): T;
    /**
     * Activates the AudioContext.
     * Must be called within a user interaction callback (like a click) to bypass browser auto-play restrictions.
     * This will also start decoding any queued sources and play any pending sound entries.
     */
    activeContext(): Promise<void>;
}
/**
 * Represents an individual sound instance.
 * Manages dynamic parameters such as volume, pitch, and looping.
 *
 * Node Graph: [SourceNode] -> [gainNode (local volume)] -> [baseGainNode (group/global volume)] -> [Destination]
 */
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
     * True if the sound is currently playing.
     */
    isPlaying: boolean;
    /**
     * True if the sound playback has finished.
     */
    wasEnded: boolean;
    options: SoundEntryOptions;
    constructor(soundSource: SoundSource, optionsSrc?: SoundEntryOptions);
    /**
     * Sets the playback pitch (speed).
     * @param pitch Pitch multiplier (1.0 is default).
     */
    setPitch(pitch: number): void;
    /**
     * Sets the local volume (gain) for this specific entry.
     * @param gain Volume level (0.0 is silent).
     */
    setGain(gain: number): void;
    private lastGain;
    /**
     * Mutes or unmutes the sound.
     * @param isMute True to mute.
     */
    setMute(isMute?: boolean): void;
    /**
     * Creates the necessary audio nodes.
     * Can be overridden to add custom nodes like filters.
    */
    protected createNodes(audioCtx: AudioContext): void;
    /**
     * Connects the created audio nodes.
     * Can be overridden to change the connection path.
     */
    protected initNodes(audioCtx: AudioContext): void;
    private _tryStartedTime;
    _wasInited: boolean;
}
/**
 * Abstract class for sound entries that have a 3D position in space.
 *
 * Node Graph: [SourceNode] -> [PannerNode] -> [gainNode] -> [baseGainNode] -> [Destination]
 */
export declare abstract class AbstractSoundEntryPositioned extends SoundEntry {
    protected pannerNode: PannerNode;
    abstract getSoundSourcePos(optionalPartialTicks: number): vec3;
    abstract getSoundSourceOrient(optionalPartialTicks: number): vec3;
}
/**
 * A sound entry with a fixed 3D coordinate.
 */
export declare class SoundEntryPositioned extends AbstractSoundEntryPositioned {
    protected pos: vec3;
    protected orient: vec3;
    constructor(src: SoundSource, x: number, y: number, z: number, xUp?: number, yUp?: number, zUp?: number, options?: SoundEntryOptions);
    getSoundSourcePos(optionalPartialTicks: number): vec3;
    getSoundSourceOrient(optionalPartialTicks: number): vec3;
}
/**
 * A sound entry that tracks a dynamic entity.
 */
export declare class SoundEntryPositionedEntity extends AbstractSoundEntryPositioned {
    protected srcEntity: SoundSourceEntity;
    constructor(src: SoundSource, srcEntity: SoundSourceEntity, options?: SoundEntryOptions);
    getSoundSourcePos(optionalPartialTicks: number): vec3;
    getSoundSourceOrient(optionalPartialTicks: number): vec3;
}
/**
 * Abstract class representing the source of audio data (URL, Base64, Blob, etc.).
 */
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
