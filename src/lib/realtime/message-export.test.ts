import { describe, expect, it } from 'vitest';
import { formatExportTxt, formatWibDateTime } from './message-export';
import type { ChatMessage } from './types';

describe('message-export', () => {
  it('formats dates accurately in WIB (UTC+7)', () => {
    // 2026-11-06 05:30 UTC -> 12:30 WIB
    const utcDate = new Date('2026-11-06T05:30:00.000Z');
    expect(formatWibDateTime(utcDate)).toBe('06-11-2026 12:30');
  });

  it('formats exported txt log conforming to TASK.md spec', () => {
    const fixedExportTime = new Date('2026-11-06T07:00:00.000Z'); // 14:00 WIB
    const messages: ChatMessage[] = [
      {
        id: 1,
        room_id: 'room-1',
        sender_type: 'HOST',
        member_id: 'm-1',
        sender_name: 'host99999',
        sender_badge: 'HOST',
        content: 'Halo selamat datang di room.',
        client_msg_id: 'c-1',
        created_at: '2026-11-06T06:00:00.000Z', // 13:00 WIB
      },
      {
        id: 2,
        room_id: 'room-1',
        sender_type: 'GUEST',
        member_id: 'm-2',
        sender_name: 'wu32t76e3',
        sender_badge: null,
        content: 'Halo Host!\nIni pesan multiline baris 2.\nDan baris 3.',
        client_msg_id: 'c-2',
        created_at: '2026-11-06T06:15:00.000Z', // 13:15 WIB
      },
    ];

    const output = formatExportTxt('Diskusi Menfess', messages, fixedExportTime);

    expect(output).toContain('Room: Diskusi Menfess');
    expect(output).toContain('Waktu Ekspor: 06-11-2026 14:00 WIB');
    expect(output).toContain('Total Pesan: 2');
    expect(output).toContain('[06-11-2026 13:00] <host99999>: Halo selamat datang di room.');
    expect(output).toContain('[06-11-2026 13:15] <wu32t76e3>: Halo Host!');
    expect(output).toContain('  Ini pesan multiline baris 2.');
    expect(output).toContain('  Dan baris 3.');
  });
});

