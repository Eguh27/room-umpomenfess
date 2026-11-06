import type { ChatMessage } from './types';

/**
 * Format tanggal dan jam ke zona waktu Asia/Jakarta (WIB)
 * Format keluaran: DD-MM-YYYY HH:mm
 */
export function formatWibDateTime(dateInput: Date | string): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (Number.isNaN(date.getTime())) {
    return '01-01-1970 00:00';
  }

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('day')}-${get('month')}-${get('year')} ${get('hour')}:${get('minute')}`;
}

/**
 * Memformat seluruh riwayat percakapan menjadi teks log .txt sesuai kontrak TASK.md:
 * - Header nama room + waktu ekspor (WIB)
 * - Baris pesan: [DD-MM-YYYY HH:mm] <handle>: isi
 * - Baris lanjutan (multiline) diberi indentasi dua spasi
 */
export function formatExportTxt(
  roomName: string,
  messages: ChatMessage[],
  exportTime: Date = new Date(),
): string {
  const headerTime = formatWibDateTime(exportTime);
  const lines: string[] = [
    `Room: ${roomName}`,
    `Waktu Ekspor: ${headerTime} WIB`,
    `Total Pesan: ${messages.length}`,
    '------------------------------------------------------------',
  ];

  for (const msg of messages) {
    const time = formatWibDateTime(msg.created_at);
    const contentLines = msg.content.split('\n');
    const firstLine = contentLines[0] ?? '';
    lines.push(`[${time}] <${msg.sender_name}>: ${firstLine}`);
    for (let i = 1; i < contentLines.length; i++) {
      lines.push(`  ${contentLines[i]}`);
    }
  }

  return lines.join('\n') + '\n';
}

/**
 * Memicu unduhan file .txt langsung di browser menggunakan Blob URL
 */
export function downloadExportTxt(filename: string, content: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.endsWith('.txt') ? filename : `${filename}.txt`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

