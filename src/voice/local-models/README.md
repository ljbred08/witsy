# Parakeet STT Models

This directory contains the implementation of NVIDIA Parakeet speech-to-text models for Witsy.

## Available Models

### Parakeet V2 (English)
- **Model ID**: `nvidia/parakeet-tdt-0.6b-v2`
- **Languages**: English only
- **Optimization**: int8 quantized for better performance
- **Download URL**: `sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8.tar.bz2`

### Parakeet V3 (Multilingual)
- **Model ID**: `nvidia/parakeet-tdt-0.6b-v3`
- **Languages**: 25 European languages
- **Optimization**: int8 quantized for better performance
- **Download URL**: `sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2`

## Files

- **`local-parakeet.ts`**: Main implementation with model downloading, caching, and transcription
- **`test-parakeet.ts`**: Comprehensive TypeScript test suite (requires compilation)
- **`test-parakeet.mjs`**: Informational JavaScript script that shows how to test via Witsy
- **`README.md`**: This documentation file

## Usage in Witsy

### Testing Models
1. Open Witsy
2. Go to **Settings → Voice → Transcribe**
3. Select **"Local"** engine
4. Choose either:
   - **Parakeet V2 (English)** for single-language optimization
   - **Parakeet V3 (Multilingual)** for multi-language support
5. Model will download automatically
6. Test with the microphone test button

### Using for Transcription
1. Navigate to the **Transcribe** screen
2. Select **Local** engine
3. Choose your preferred Parakeet model
4. Use the microphone or upload audio files
5. Transcription will appear in real-time

## Model Storage

Models are cached in: `~/.cache/sherpa-onnx/`
- V2: `~/.cache/sherpa-onnx/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2/`
- V3: `~/.cache/sherpa-onnx/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3/`

## Technical Details

### Model Configuration
Both models use the sherpa-onnx-node library with these configurations:
- **Sample Rate**: 16kHz
- **Feature Dim**: 80
- **Provider**: CPU
- **Threads**: 2
- **Model Type**: nemo_transducer

### Dependencies
- `sherpa-onnx-node`: Core speech recognition engine
- `decompress`: Model archive extraction
- `decompress-tarbz2`: BZ2 format support

### Performance Characteristics
- **int8 Quantization**: Faster inference, lower memory usage
- **CPU Optimized**: Runs efficiently on modern CPUs
- **Streaming Ready**: Supports real-time transcription
- **Multilingual Support**: V3 supports 25 European languages

## Development Notes

### Adding New Models
To add a new Parakeet model:
1. Add the model to the `static readonly models` array in `stt-local.ts`
2. Add the URL constant in `local-parakeet.ts`
3. Update the model detection logic in `ensureParakeetBundle()`
4. Update `isModelDownloaded()` and `deleteModel()` methods

### Model Format Support
The implementation supports:
- Transducer models (encoder/decoder/joiner)
- CTC models (single model file)
- Both int8 and float32 precision
- Automatic model type detection

## Troubleshooting

### Common Issues
1. **Model Download Fails**: Check internet connection and try again
2. **Transcription Errors**: Ensure audio is clear and at 16kHz sample rate
3. **Memory Issues**: Close other applications if using larger models
4. **FFmpeg Not Found**: Install FFmpeg for audio file conversion

### Debug Information
Enable debug logging in Witsy settings to see detailed model loading and transcription progress.

## Languages Supported (V3)

The V3 multilingual model supports 25 European languages including:
- English, Spanish, French, German, Italian
- Dutch, Portuguese, Polish, Czech, Hungarian
- Romanian, Bulgarian, Croatian, Serbian, Slovenian
- Estonian, Latvian, Lithuanian, Swedish, Norwegian
- Danish, Finnish, Greek, and more.

Check the model documentation for the complete list of supported languages.