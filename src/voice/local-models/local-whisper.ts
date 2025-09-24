// src/voice/local-models/local-whisper.ts
import { env, pipeline } from '@huggingface/transformers'
import { Configuration } from 'types/config'
import { ProgressCallback, ProgressInfo, TaskStatus, TranscribeResponse } from '../stt'

/**
 * Creates a Whisper transcriber function compatible with the STTLocal interface.
 * The returned function accepts raw Float32Array audio data and optional options,
 * and resolves with a {@link TranscribeResponse}.
 */
export async function createWhisperTranscriber(
  config: Configuration,
  model: string,
  callback?: ProgressCallback
): Promise<(audio: Float32Array, opts?: object) => Promise<TranscribeResponse>> {
  // Ensure that local model downloading is disabled – this mirrors the behavior
  // that was previously performed in STTLocal's constructor.
  env.allowLocalModels = false

  const pipe = await pipeline('automatic-speech-recognition', model, {
    ...(config.stt.whisper.gpu
      ? {
          dtype: 'fp32',
          device: 'webgpu',
        }
      : {
          dtype: 'q8',
        }),
    progress_callback: callback,
    // For medium models, use the `no_attentions` revision to reduce RAM usage.
    revision: model.includes('/whisper-medium') ? 'no_attentions' : 'main',
  })

  // Return a wrapper that matches the expected signature.
  return async (audio: Float32Array, opts?: object) => {
    const output = await pipe(audio, opts)
    return output as TranscribeResponse
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