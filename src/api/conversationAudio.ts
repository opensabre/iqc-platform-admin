import http from "@/api/http";
export interface AudioMetadata { conversationId: string; mediaType: string; sizeBytes: number; durationMs: number }
const path = (id: string) => `/iqc/conversations/${encodeURIComponent(id)}/audio`;
export const getAudioMetadata = (id: string) => http.get<AudioMetadata>(path(id)).then(response => response.data);
export const uploadConversationAudio = (id: string, file: File) => {
  const body = new FormData(); body.append("file", file);
  return http.post<AudioMetadata>(path(id), body, { timeout: 120000 }).then(response => response.data);
};
/** Same-origin cookie authentication; do not put credentials or storage identities in playback URLs. */
export const audioContentUrl = (id: string) => http.getUri({ url: `${path(id)}/content` });
