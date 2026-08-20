import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import * as api from '@/services/api'

export const loadMessages = createAsyncThunk('chat/load', async (jobId) => {
  const { messages } = await api.fetchMessages(jobId)
  return { jobId, messages }
})

export const sendMessageThunk = createAsyncThunk('chat/send', async ({ jobId, body, attachment }) => {
  const { message } = await api.sendMessage(jobId, body, attachment)
  return { jobId, message }
})

export const editMessageThunk = createAsyncThunk('chat/edit', async ({ jobId, messageId, body }) => {
  const { message } = await api.editMessage(jobId, messageId, body)
  return { jobId, message }
})

export const deleteMessageThunk = createAsyncThunk('chat/delete', async ({ jobId, messageId }) => {
  const { message } = await api.deleteMessage(jobId, messageId)
  return { jobId, message }
})

// Replace the matching message in-place. Used by both the optimistic
// editMessageThunk.fulfilled and the `chat:message-edited` socket listener
// so a single code path keeps the bubble swap consistent.
const replaceMessage = (s, jobId, message) => {
  const arr = s.byJob[jobId]
  if (!arr) return
  const idx = arr.findIndex((m) => m.id === message.id)
  if (idx === -1) return
  s.byJob[jobId] = [...arr.slice(0, idx), { ...arr[idx], ...message }, ...arr.slice(idx + 1)]
}

const slice = createSlice({
  name: 'chat',
  initialState: { byJob: {} },    // { [jobId]: [messages…] }
  reducers: {
    receiveMessage: (s, { payload }) => {
      const arr = s.byJob[payload.job_id] || []
      if (arr.some((m) => m.id === payload.id)) return
      s.byJob[payload.job_id] = [...arr, payload]
    },
    // Socket-driven update for an edited message — payload is the full
    // message row from the server, so we just swap it in place by id.
    applyMessageEdit: (s, { payload }) => {
      if (!payload?.job_id || !payload?.id) return
      replaceMessage(s, payload.job_id, payload)
    },
    clearJobChat: (s, { payload }) => { delete s.byJob[payload] },
  },
  extraReducers: (b) => {
    b.addCase(loadMessages.fulfilled, (s, { payload }) => { s.byJob[payload.jobId] = payload.messages })
     .addCase(sendMessageThunk.fulfilled, (s, { payload }) => {
       const arr = s.byJob[payload.jobId] || []
       if (arr.some((m) => m.id === payload.message.id)) return
       s.byJob[payload.jobId] = [...arr, payload.message]
     })
     .addCase(editMessageThunk.fulfilled, (s, { payload }) => {
       replaceMessage(s, payload.jobId, payload.message)
     })
     .addCase(deleteMessageThunk.fulfilled, (s, { payload }) => {
       replaceMessage(s, payload.jobId, payload.message)
     })
  },
})

export const { receiveMessage, applyMessageEdit, clearJobChat } = slice.actions
export const selectJobMessages = (jobId) => (s) => s.chat.byJob[jobId] || []
export default slice.reducer
