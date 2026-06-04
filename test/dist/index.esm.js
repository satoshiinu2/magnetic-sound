function decodeBase64ArrayBuffer(base64) {
    const cleanBase64 = base64.split(',')[1] || base64;
    const binaryString = atob(cleanBase64);
    const byteArray = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        byteArray[i] = binaryString.charCodeAt(i);
    }
    return byteArray.buffer;
}
function decodeBlobArrayBuffer(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(blob);
    });
}

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
class SoundSystem {
    tps;
    /**
     * a queue to load sound sources.
     */
    loadQueue = new Set;
    /**
     * a queue to decode sound sources.
     */
    decodeQueue = new Set;
    /**
     * a queue to initialization sound entries.
     */
    initQueue = new Set;
    /**
     * actived sounds set.
     */
    sounds = new Set;
    context;
    listener;
    lastEarPos = [0, 0, 0];
    lastEarOrient = [0, 1, 0];
    /**
     * @param tps tps to interpolation timings. if you don't use interpolation set 0.
     */
    constructor(tps = 0) {
        this.tps = tps;
        document.addEventListener("click", this.onclick.bind(this));
    }
    /**
     * load or fetch sources
     */
    async loadAllQueuedSources() {
        const promises = Array.from(this.loadQueue).map(async (source) => {
            const result = await source.load();
            if (this.wasInited()) {
                await source.decode(this.context);
            }
            else {
                this.decodeQueue.add(source);
            }
            this.loadQueue.delete(source);
            return result;
        });
        return await Promise.all(promises);
    }
    /**
     * Update the sound system.
     * @param optionalPartialTicks the partial ticks to use for callback
     * @default 1
      */
    updateTick(optionalPartialTicks = 1) {
        if (!this.wasInited())
            return;
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
        }
        else {
            this.context.listener.setOrientation(pos[0], pos[1], pos[2], orient[0], orient[1], orient[2]);
        }
        for (const soundEntry of this.sounds) {
            soundEntry.updateTick(this, optionalPartialTicks);
            if (soundEntry.wasEnded)
                this.sounds.delete(soundEntry);
        }
    }
    getNextTickTime() {
        if (!this.wasInited())
            return 0;
        return this.context.currentTime + this.tps / 1000;
    }
    getSoundEarPos(optionalPartialTicks) {
        if (this.listener == null)
            return this.lastEarPos;
        const earPos = this.listener.getSoundEarPos(optionalPartialTicks);
        if (earPos.some(n => !isFinite(n)))
            return this.lastEarPos;
        return this.lastEarPos = earPos;
    }
    getSoundEarOrient(optionalPartialTicks) {
        if (this.listener == null)
            return this.lastEarOrient;
        const earOrient = this.listener.getSoundEarOrient(optionalPartialTicks);
        if (earOrient.some(n => !isFinite(n)))
            return this.lastEarOrient;
        return this.lastEarOrient = earOrient;
    }
    /**
    * set the listener for the sound system.
    * @param listener the listener to set for the sound system.
    */
    setListener(listener) {
        this.listener = listener;
    }
    /**
     * play sound to the sound system.
     * @param soundEntry sound to play in the sound system.
     */
    play(soundEntry) {
        if (this.wasInited()) {
            soundEntry.init(this);
            this.sounds.add(soundEntry);
        }
        else {
            soundEntry.tryStartBeforeClick();
            this.initQueue.add(soundEntry);
        }
    }
    /**
     * plays all sounds in the sound system.
     * @param pauseLevel The level at which the sound can be paused.
     * @default Infinity
     */
    pauseAll(pauseLevel = Infinity) {
        for (const soundEntry of this.sounds) {
            if (!soundEntry.canPauseAtLevel(pauseLevel))
                continue;
            soundEntry.pause(this);
        }
    }
    /**
     * replays all sounds in the sound system.
     */
    resumeAll() {
        for (const soundEntry of this.sounds) {
            soundEntry.play(this);
        }
    }
    /**
     * Registers the sound source to load.
     */
    registerSource(soundSource) {
        this.loadQueue.add(soundSource);
        return soundSource;
    }
    wasInited() {
        return this.context != null;
    }
    async onclick() {
        if (this.context != null)
            return;
        this.context = new AudioContext();
        await this.context.resume();
        const toDecode = [...this.decodeQueue];
        this.decodeQueue.clear();
        for (const soundSource of toDecode) {
            await soundSource.decode(this.context);
        }
        const toInit = [...this.initQueue];
        this.initQueue.clear();
        for (const soundEntry of toInit) {
            if (soundEntry.wasInited)
                continue;
            soundEntry.init(this);
            this.sounds.add(soundEntry);
        }
    }
}
class SoundEntry {
    soundSource;
    options;
    source;
    gainNode;
    startTime = 0;
    pauseTime = 0;
    pauseLevel;
    soundSystem;
    /**
     * seted true when playing
     */
    isPlaying = false;
    /**
     * seted true when ended;
     */
    wasEnded = false;
    constructor(soundSource, options) {
        this.soundSource = soundSource;
        this.options = options;
        this.pauseLevel = options?.pauseLevel ?? 1;
    }
    /**
     * set sound pitch (speed)
     * @param pitch pitch to set
     */
    setPitch(pitch) {
        const time = this.soundSystem.getNextTickTime();
        this.source?.playbackRate.setValueAtTime(pitch, time);
    }
    /**
     * set sound gain (volume)
     * @param gain gain to set
     */
    setGain(gain) {
        const time = this.soundSystem.getNextTickTime();
        this.gainNode.gain.setTargetAtTime(gain, time, 0.01);
    }
    /**
     * Creates the audio nodes for the sound entry.
     */
    createNodes(audioCtx) {
        this.gainNode = audioCtx.createGain();
    }
    /**
     * Initializes the audio nodes for the sound entry.
     */
    initNodes(audioCtx) {
        this.source?.connect(this.gainNode);
        this.gainNode.connect(audioCtx.destination);
    }
    /**
     * internal methods. do not call.
     */
    /**@deprecated internal method */
    init(soundSystem) {
        this.soundSystem = soundSystem;
        if (!soundSystem.wasInited())
            throw new Error("soundSystem is not initializationed");
        if (this.tryStartedTime) {
            this.pauseTime = (performance.now() - this.tryStartedTime) / 1000;
        }
        this.createNodes(soundSystem.context);
        this.play(soundSystem);
        this.wasInited = true;
    }
    /**
     * for timing adjustment
     * @deprecated internal method
     */
    tryStartBeforeClick() {
        this.tryStartedTime = performance.now();
    }
    tryStartedTime = undefined;
    wasInited = false;
    /**@deprecated internal method */
    updateTick(soundSystem, optionalPartialTicks) {
    }
    /**@deprecated internal method */
    play(soundSystem) {
        if (this.isPlaying)
            return;
        const audioCtx = soundSystem.context;
        if (audioCtx == null)
            return;
        this.source = audioCtx.createBufferSource();
        this.source.buffer = this.soundSource.getAudioBuffer();
        this.source.loop = this.options?.loop ?? false;
        this.initNodes(audioCtx);
        this.startTime = audioCtx.currentTime - this.pauseTime;
        if (this.pauseTime > 0) {
            this.source.start(0, this.pauseTime);
        }
        else {
            this.source.start();
        }
        this.isPlaying = true;
        this.wasEnded = false;
        this.source.onended = () => {
            this.isPlaying = false;
            this.pauseTime = 0;
            this.wasEnded = true;
        };
    }
    /**@deprecated internal method */
    canPauseAtLevel(level) {
        return level >= this.pauseLevel;
    }
    /**@deprecated internal method */
    pause(soundSystem) {
        if (!this.isPlaying)
            return;
        const audioCtx = soundSystem.context;
        if (audioCtx == null)
            return;
        this.source?.stop();
        this.pauseTime = audioCtx.currentTime - this.startTime;
        this.isPlaying = false;
    }
    /**@deprecated internal method */
    stop(soundSystem) {
        if (!this.isPlaying)
            return;
        this.source?.stop();
        this.pauseTime = 0;
        this.isPlaying = false;
    }
}
class AbstractSoundEntryPositioned extends SoundEntry {
    pannerNode;
    /**@deprecated internal method */
    updateTick(soundSystem, optionalPartialTicks) {
        if (!soundSystem.wasInited())
            return;
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
    createNodes(audioCtx) {
        this.pannerNode = audioCtx.createPanner();
        this.pannerNode.panningModel = this.soundSource.options?.panningModel ?? "HRTF";
        this.pannerNode.distanceModel = this.soundSource.options?.distanceModel ?? "inverse";
        this.pannerNode.refDistance = this.soundSource.options?.refDistance ?? 1;
        this.pannerNode.maxDistance = this.soundSource.options?.maxDistance ?? 10000;
        this.pannerNode.rolloffFactor = this.soundSource.options?.rolloffFactor ?? 1;
        super.createNodes(audioCtx);
    }
    initNodes(audioCtx) {
        this.source?.connect(this.pannerNode);
        this.pannerNode.connect(audioCtx.destination);
        this.gainNode.connect(audioCtx.destination);
    }
}
class SoundEntryPositioned extends AbstractSoundEntryPositioned {
    pos;
    orient;
    constructor(src, x, y, z, xUp = 0, yUp = 0, zUp = 0, options) {
        super(src, options);
        this.pos = [x, y, z];
        this.orient = [xUp, yUp, zUp];
    }
    getSoundSourcePos(optionalPartialTicks) {
        return this.pos;
    }
    getSoundSourceOrient(optionalPartialTicks) {
        return this.orient;
    }
}
class SoundEntryPositionedEntity extends AbstractSoundEntryPositioned {
    srcEntity;
    constructor(src, srcEntity, options) {
        super(src, options);
        this.srcEntity = srcEntity;
    }
    getSoundSourcePos(optionalPartialTicks) {
        return this.srcEntity.getSoundSourcePos(optionalPartialTicks);
    }
    getSoundSourceOrient(optionalPartialTicks) {
        return this.srcEntity.getSoundSourceOrient(optionalPartialTicks);
    }
}
class SoundSource {
    options;
    audioBuffer;
    arrayBuffer;
    constructor(options) {
        this.options = options;
    }
    /**
    * Decodes the sound source.
    * @param context The audio context to decode the sound source.
    * @returns The decoded audio buffer.
    */
    async decode(context) {
        if (this.arrayBuffer == null) {
            throw new Error("Array Buffer not loaded. Call load() first.");
        }
        return this.audioBuffer = await context.decodeAudioData(this.arrayBuffer);
    }
    wasDecoded() {
        return this.audioBuffer != null;
    }
    getAudioBuffer() {
        if (this.audioBuffer == null) {
            throw new Error("Audio Buffer not loaded. Call decode() first.");
        }
        return this.audioBuffer;
    }
}
class SoundSourceUrl extends SoundSource {
    src;
    /**
     * A sound source that is a audio source.
     * @param src The audio source.
     */
    constructor(src, options) {
        super(options);
        this.src = src;
    }
    /**
     * Loads the sound source.
     * @param context The audio context to decode the sound source.
     * @returns The decoded audio buffer.
     * @deprecated internal method
     */
    async load() {
        const response = await fetch(this.src);
        return this.arrayBuffer = await response.arrayBuffer();
    }
}
class SoundSourceBase64 extends SoundSource {
    src;
    /**
     * A sound source that is a audio source.
     * @param src The audio source.
     */
    constructor(src, options) {
        super(options);
        this.src = src;
    }
    /**
     * Loads the sound source.
     * @param context The audio context to decode the sound source.
     * @returns The decoded audio buffer.
     * @deprecated internal method
     */
    async load() {
        return this.arrayBuffer = decodeBase64ArrayBuffer(this.src);
    }
}
class SoundSourceBlob extends SoundSource {
    src;
    /**
     * A sound source that is a audio source.
     * @param src The audio source.
     */
    constructor(src, options) {
        super(options);
        this.src = src;
    }
    /**
     * Loads the sound source.
     * @param context The audio context to decode the sound source.
     * @returns The decoded audio buffer.
     * @deprecated internal method
     */
    async load() {
        return this.arrayBuffer = await decodeBlobArrayBuffer(this.src);
    }
}

export { AbstractSoundEntryPositioned, SoundEntry, SoundEntryPositioned, SoundEntryPositionedEntity, SoundSource, SoundSourceBase64, SoundSourceBlob, SoundSourceUrl, SoundSystem };
