<template>
  <div class="preview">
    <header class="toolbar">
      <template v-if="message">
        <div class="title">{{ message.content }}</div>
        <div class="icon undo" @click="$emit('undo')" v-if="canUndo || canRedo" :class="{ disabled: isGenerating || !canUndo }">
          <BIconArrowCounterclockwise />
        </div>
        <div class="icon redo" @click="$emit('redo')" v-if="canUndo || canRedo" :class="{ disabled: isGenerating || !canRedo }">
          <BIconArrowClockwise />
        </div>
        <div class="icon info" @click="onInfo">
          <BIconInfoCircle />
        </div>
        <div class="icon fullscreen" @click="onFullScreen" v-if="!message.isVideo()">
          <BIconFullscreen />
        </div>
        <div class="icon copy" @click="onCopy" v-if="!message.isVideo()">
          <BIconClipboardCheck v-if="copying" />
          <BIconClipboard v-else />
        </div>
        <div class="icon save" @click="onDownload">
          <BIconDownload />
        </div>
        <div class="icon delete" @click="onDelete">
          <BIconTrash />
        </div>
      </template>
    </header>
    <main v-if="!message" class="empty">
      <div v-if="isGenerating" class="loading">
        <Loader />
        <Loader />
        <Loader />
      </div>
      <span v-else>{{ t('designStudio.emptyPlaceholder') }}</span>
    </main>
    <main v-else class="media">
      <video v-if="message.isVideo()" :src="message.attachments[0].url" :alt="message.content" class="video" controls ref="mediaElement" @loadeddata="updateOverlay" />
      <img v-else :src="message.attachments[0].url" @click="onFullScreen" ref="mediaElement" @load="updateOverlay" />
      <div v-if="isGenerating" class="overlay loading" ref="overlayElement">
        <Loader />
        <Loader />
        <Loader />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">

import { ref, watch, onMounted, nextTick } from 'vue'
import { t } from '../services/i18n'
import Message from '../models/message'
import Dialog from '../composables/dialog'
import Loader from '../components/Loader.vue'

const props = defineProps({
  message: {
    type: Object as () => Message,
    default: null
  },
  isGenerating: {
    type: Boolean,
    default: false
  },
  canUndo: {
    type: Boolean,
    default: false
  },
  canRedo: {
    type: Boolean,
    default: false
  }
})

const copying = ref(false)

const emit = defineEmits(['fullscreen', 'delete', 'undo', 'redo'])

const mediaElement = ref(null)
const overlayElement = ref(null)

onMounted(() => {
  window.addEventListener('resize', updateOverlay)
  watch(() => props.isGenerating, async () => {
    await nextTick()
    updateOverlay() 
  }, { immediate: true })
})

const updateOverlay = () => {
  
  if (!mediaElement.value || !overlayElement.value) return
  
  const media = mediaElement.value
  const overlay = overlayElement.value
  
  // Get the computed dimensions of the media element
  const rect = media.getBoundingClientRect()
  
  // Apply the same dimensions to the overlay
  overlay.style.width = `${media.offsetWidth}px`
  overlay.style.height = `${media.offsetHeight}px`
  overlay.style.top = `${rect.top - media.parentNode.getBoundingClientRect().top}px`
  overlay.style.left = `${rect.left - media.parentNode.getBoundingClientRect().left}px`
}

const onInfo = () => {
  if (!props.message) return

  // we need to build the text
  let text = `Engine: ${props.message.engine}\nModel: ${props.message.model}`

  // add extra params
  if (props.message.toolCalls) {
    props.message.toolCalls.forEach((call) => {
      Object.keys(call.params).forEach((key) => {
        text += `\n${key}: ${call.params[key]}`
      })
    })
  }

  Dialog.show({
    title: props.message.content,
    text: text,
  })
}

const onFullScreen = () => {
  if (!props.message) return
  emit('fullscreen', props.message.attachments[0].url)
}

const onCopy = async () => {
  if (!props.message || props.message.isVideo()) return
  copying.value = true
  await window.api.clipboard.writeImage(props.message.attachments[0].url)
  setTimeout(() => {
    copying.value = false
  }, 1000)
}

const onDownload = () => {
  const url = props.message.attachments[0].url
  window.api.file.download({
    url: url,
    properties: {
      prompt: true,
      directory: 'downloads',
      filename: `${props.message.isVideo() ? 'video' : 'image'}.${url.split('.').pop()}`,
    }
  })
}

const onDelete = () => {
  if (!props.message) return
  emit('delete', props.message)
}

</script>


<style scoped>

.preview {
  
  width: calc(100% - var(--create-panel-width));
  --preview-padding: 32px;

  .loading {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 32px;

    .loader {
      width: 24px;
      height: 24px;
    }

  }

  .empty {
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    line-height: 300%;
    padding: 0px 64px;
    color: var(--text-color) !important;
    opacity: 0.8;
    text-align: center;
 
    span {
      font-family: var(--font-family-serif);
      font-style: italic;
      font-size: 24pt;
    }

  }

  .media {
    position: relative;
    width: calc(100% - var(--preview-padding) * 2);
    height: calc(100% - var(--window-toolbar-height) - var(--preview-padding) * 2);
    display: flex;
    justify-content: center;
    align-items: center;
    text-align: center;
    padding: var(--preview-padding);
    -webkit-app-region: no-drag;

    img, video {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      cursor: pointer;
    }

    .overlay {
      position: absolute;
      background-color: black;
      opacity: 0.5;
      z-index: 100;
      pointer-events: none;

      &.loading .loader {
        background-color: white;
        opacity: 0.7;
      }
    }
  }
}

</style>
