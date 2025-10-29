// src/voice/local-models/local-whisper.ts
import { env, pipeline } from '@huggingface/transformers'
import { Configuration } from 'types/config'
import { ProgressCallback, ProgressInfo, TaskStatus, TranscribeResponse } from '../stt'

/**
 * Creates a Whisper transcriber function compatible with the STTLocal interface.
 * This implementation ports the full functionality from the original STTWhisper class
 * and includes proper error handling, progress callbacks, and model management.
 *
 * The returned function accepts raw Float32Array audio data and optional options,
 * and resolves with a {@link TranscribeResponse}.
 *
 * Features ported from original STTWhisper:
 * - GPU/CPU configuration support via config.stt.whisper.gpu
 * - Progress callback handling with 'ready' status detection
 * - Model-specific optimizations (no_attentions revision for medium models)
 * - Proper error logging and callback error reporting
 * - Language detection using config.stt.locale
 */
export async function createWhisperTranscriber(
  config: Configuration,
  model: string,
  callback?: ProgressCallback
): Promise<(audio: Float32Array, opts?: object) => Promise<TranscribeResponse>> {
  // Ensure that local model downloading is disabled – this mirrors the behavior
  // that was previously performed in STTLocal's constructor.
  env.allowLocalModels = false

  let transcriber: any
  let ready = false

  try {
    transcriber = await pipeline('automatic-speech-recognition', model, {
      ...(config.stt.whisper.gpu
        ? {
            dtype: 'fp32',
            device: 'webgpu',
          }
        : {
            dtype: 'q8',
          }),
      progress_callback: (data: ProgressInfo) => {
        if ((data as TaskStatus).status === 'ready') {
          ready = true
        }
        if (callback) {
          callback(data)
        }
      },
      // For medium models, use the `no_attentions` revision to reduce RAM usage.
      revision: model.includes('/whisper-medium') ? 'no_attentions' : 'main',
    })
  } catch (error) {
    console.error(['[whisper] error when initializing:', error])
    callback?.({ status: 'error', message: (error as Error).message })
    throw error
  }

  // Return a wrapper that matches the expected signature
  return async (audio: Float32Array, opts?: object) => {
    try {
      // Merge default options with provided options
      const transcribeOpts = {
        language: config.stt.locale?.substring(0, 2),
        ...opts,
      }

      const output = await transcriber(audio, transcribeOpts)
      return output as TranscribeResponse
    } catch (error) {
      console.error('[whisper] transcription error:', error)
      throw error
    }
  }
}

export async function isWhisperModelDownloaded(model: string): Promise<boolean> {
  const storage = await caches.open('transformers-cache')
  const keys = await storage.keys()
  for (const key of keys) {
    if (key.url.includes(`/${model}/`)) {
      return true
    }
  }
  return false
}

export async function deleteWhisperModel(model: string): Promise<void> {
  const storage = await caches.open('transformers-cache')
  const keys = await storage.keys()
  for (const key of keys) {
    if (key.url.includes(`/${model}/`)) {
      await storage.delete(key)
    }
  }
}

export async function deleteAllWhisperModels(): Promise<void> {
  await caches.delete('transformers-cache')
}