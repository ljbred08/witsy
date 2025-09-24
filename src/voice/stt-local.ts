import { Configuration } from 'types/config'
import { STTEngine, ProgressCallback, ProgressInfo, TaskStatus, TranscribeResponse } from './stt'
import {
  createWhisperTranscriber,
  isWhisperModelDownloaded,
  deleteWhisperModel,
  deleteAllWhisperModels,
} from './local-models/local-whisper'
import {
  createParakeetTranscriber,
  isParakeetModelDownloaded,
  deleteParakeetModel,
  deleteAllParakeetModels,
} from './local-models/local-parakeet'


export default class STTLocal implements STTEngine {

  config: Configuration
  transcriber?: any
  ready = false

  static readonly models: any[] = [
    { id: 'Xenova/whisper-tiny', label: 'Whisper Turbo Tiny (requires download)' },
    { id: 'Xenova/whisper-base', label: 'Whisper Turbo Base (requires download)' },
    { id: 'Xenova/whisper-small', label: 'Whisper Turbo Small (requires download)' },
    { id: 'Xenova/whisper-medium', label: 'Whisper Turbo Medium (requires download)' },
    { id: 'nvidia/parakeet-tdt-0.6b-v2', label: 'NVIDIA Parakeet TDT 0.6B V2 (requires download)' },
    //{ id: 'ibm-granite/granite-speech-3.3-2b', label: 'IBM Granite Speech 3.3 2B (requires export)' }, // Won't work until an ONNX conversion is available for Granite Speech.//{ id: 'ibm-granite/granite-speech-3.3-8b', label: 'IBM Granite Speech 3.3 8B (requires download)' },
  ]

  constructor(config: Configuration) {
    this.config = config
  }

  get name(): string {
    return 'local'
  }

  isReady(): boolean {
    return this.ready
  }// eslint-disable-next-line @typescript-eslint/no-unused-vars
  isStreamingModel(model: string): boolean {
    return false;
  }

  static requiresDownload(): boolean {
    return true;
  }

  requiresDownload(): boolean {
    return STTLocal.requiresDownload()
  }

  async initialize(callback?: ProgressCallback): Promise<void> {
    try {
      const model = this.config.stt.model || 'Xenova/whisper-tiny'

      // Offload model-specific initialization to dedicated handlers.
      if (model.startsWith('Xenova/whisper')) {
        this.transcriber = await this.whisperTranscriber(model, callback)
      } else if (model === 'nvidia/parakeet-tdt-0.6b-v2') {
        this.transcriber = await this.parakeetTranscriber(callback)
      } else {
        throw new Error(`Unsupported local STT model: ${model}`)
      }
    } catch (error) {
      console.error(error)
      callback?.({ status: 'error', message: error.message })
    }
  }

  // Create a Whisper-specific transcriber function so other models can return compatible functions
  private async whisperTranscriber(model: string, callback?: ProgressCallback): Promise<(audio: Float32Array, opts?: object) => Promise<TranscribeResponse>> {
    // Delegate to shared Whisper transcriber implementation
    // We need to wrap the callback to capture the ready status
    const wrappedCallback = (data: ProgressInfo) => {
      if ((data as TaskStatus).status === 'ready') {
        this.ready = true
      }
      callback?.(data)
    }
    return createWhisperTranscriber(this.config, model, wrappedCallback)
  }

  // Create a Parakeet transcriber using sherpa-onnx-node
  private async parakeetTranscriber(callback?: ProgressCallback): Promise<(audio: Float32Array, opts?: object) => Promise<TranscribeResponse>> {
    const wrappedCallback = (data: ProgressInfo) => {
      if ((data as TaskStatus).status === 'ready') {
        this.ready = true
      }
      callback?.(data)
    }
    return createParakeetTranscriber(wrappedCallback)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async transcribe(audioBlob: Blob, opts?: object): Promise<TranscribeResponse> {
    return new Promise((resolve, reject) => {
      try {
        // We need to decode the audio file
        const fileReader = new FileReader()
        fileReader.onloadend = async () => {
          const audioCtx = new AudioContext({ sampleRate: 16000 })
          const arrayBuffer = fileReader.result as ArrayBuffer
          const decoded = await audioCtx.decodeAudioData(arrayBuffer)

          // Now we can send the audio data to the transcriber
          const output = await this.transcriber(decoded.getChannelData(0), {
            language: this.config.stt.locale?.substring(0, 2)
          })
          resolve(output)
        }
        fileReader.readAsArrayBuffer(audioBlob)
      } catch (error) {
        console.error(error)
        reject(error)
      }
    })
  }

  async isModelDownloaded(model: string): Promise<boolean> {
    if (model.startsWith('Xenova/whisper')) {
      return isWhisperModelDownloaded(model)
    } else if (model === 'nvidia/parakeet-tdt-0.6b-v2') {
      return isParakeetModelDownloaded()
    }
    return false
  }

  async deleteModel(model: string): Promise<void> {
    if (model.startsWith('Xenova/whisper')) {
      await deleteWhisperModel(model)
    } else if (model === 'nvidia/parakeet-tdt-0.6b-v2') {
      await deleteParakeetModel()
    }
  }

  async deleteAllModels(): Promise<void> {
    await deleteAllWhisperModels()
    await deleteAllParakeetModels()
  }
}














