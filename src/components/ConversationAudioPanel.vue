<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { usePermission } from "@/composables/permission";
import { audioContentUrl, getAudioMetadata, uploadConversationAudio, type AudioMetadata } from "@/api/conversationAudio";
import type { ConversationMessage } from "@/api/conversations";
const props=defineProps<{conversationId:string;messages:ConversationMessage[]}>();
const emit=defineEmits<{position:[messageId:string]}>();
const {can}=usePermission();const metadata=ref<AudioMetadata>(),player=ref<HTMLAudioElement>(),loading=ref(false),busy=ref(false),error=ref("");let generation=0,uploadGeneration=0;
const playbackUrl=computed(()=>metadata.value&&can("iqc:audio:read")?audioContentUrl(props.conversationId):undefined);
async function load(){const ticket=++generation;metadata.value=undefined;error.value="";loading.value=false;
  if(!can("iqc:audio:view"))return;loading.value=true;
  try{const received=await getAudioMetadata(props.conversationId);if(ticket===generation){if(received.conversationId!==props.conversationId||!Number.isSafeInteger(received.durationMs)||received.durationMs<=0||!Number.isSafeInteger(received.sizeBytes)||received.sizeBytes<=0||!["audio/wav","audio/mpeg","audio/ogg","audio/flac","audio/mp4"].includes(received.mediaType))throw Error("invalid metadata");metadata.value=received;}}
  catch(failure){if(ticket===generation&&(failure as {response?:{status?:number}}).response?.status!==404)error.value="音频信息加载失败";}
  finally{if(ticket===generation)loading.value=false;}}
watch(()=>[props.conversationId,can("iqc:audio:view")],()=>{uploadGeneration++;busy.value=false;player.value?.pause();void load();},{immediate:true});
watch(()=>can("iqc:audio:read"),allowed=>{if(!allowed)player.value?.pause();},{flush:"sync"});
onBeforeUnmount(()=>{generation++;uploadGeneration++;player.value?.pause();});
async function upload(event:Event){const input=event.target as HTMLInputElement,file=input.files?.[0];input.value="";if(!file||busy.value||!can("iqc:audio:upload"))return;
  const ticket=generation,uploadTicket=++uploadGeneration,id=props.conversationId;busy.value=true;error.value="";
  try{await uploadConversationAudio(id,file);if(ticket===generation)await load();}
  catch{if(ticket===generation)error.value="上传失败，请确认是有效PCM WAV且转写区间未超出实际时长。已有音频不能替换。";}
  finally{if(uploadTicket===uploadGeneration)busy.value=false;}}
function seek(message:ConversationMessage){if(can("iqc:audio:read")&&player.value&&metadata.value&&typeof message.startMs==="number"&&Number.isSafeInteger(message.startMs)&&message.startMs>=0&&message.startMs<=metadata.value.durationMs){player.value.currentTime=message.startMs/1000;}}
function position(){if(!player.value)return;const current=player.value.currentTime*1000;const message=props.messages.find(item=>typeof item.startMs==="number"&&typeof item.endMs==="number"&&item.startMs<=current&&current<item.endMs);if(message)emit("position",message.id);}
const canSeek=computed(()=>Boolean(playbackUrl.value));
defineExpose({seek,canSeek});
</script>
<template><section v-if="can('iqc:audio:view')||can('iqc:audio:upload')" class="audio-panel">
  <p v-if="loading">正在加载音频信息…</p><p v-if="error" role="alert">{{error}}</p>
  <template v-if="metadata"><p>原始音频 · {{(metadata.durationMs/1000).toFixed(3)}} 秒</p><audio v-if="playbackUrl" ref="player" :key="conversationId" :src="playbackUrl" controls preload="none" @timeupdate="position" @error="error='音频播放失败，请检查访问权限或重新加载。'"/></template>
  <label v-if="can('iqc:audio:upload')&&!metadata">上传PCM WAV <input type="file" accept="audio/wav,.wav" :disabled="busy||loading" @change="upload"/></label>
</section></template>
<style scoped>.audio-panel{margin-bottom:16px}audio{width:100%}[role=alert]{color:#b91c1c}</style>
