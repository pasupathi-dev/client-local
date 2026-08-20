// src/utils/helpers.js
export const truncate = (str = '', n = 70) =>
  str.length > n ? str.slice(0, n) + '…' : str

export const formatDate = (date = new Date()) =>
  new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(date)
