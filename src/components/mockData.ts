/* Data tiruan untuk kerangka UI statis (T-31, T-31a).
   Kontrak nyata menyusul di T-50..T-54; jangan di-import dari modul server.
   Semua identitas fiktif: handle acak sistem [a-z0-9]{9} tanpa user_id (S-09, D-14).
   Lencana HOST/VERIFIED menyimulasi kolom sender_badge / handle_verified dari server (D-14b). */

export interface Quota {
  used: number;
  max: number;
  tier: 'free' | 'premium';
}

/** Kuota room publik per tier (TASK bagian 3: max_public_rooms — nilai masih usulan). */
export interface PublicQuota {
  used: number;
  max: number;
}

export interface HostRoom {
  id: string;
  slug: string;
  name: string;
  status: 'ACTIVE' | 'CLOSED';
  visibility: 'PRIVATE' | 'PUBLIC';
  approvedCount: number;
  pendingCount: number;
  maxGuests: number;
  endsIn: string;
  typingOn: boolean;
}

export interface ChatMessage {
  id: number;
  sender: 'HOST' | 'GUEST';
  /** Snapshot handle per pesan (D-14a). */
  handle: string;
  /** Lencana dari server: HOST untuk Host, VERIFIED untuk handle buatan Admin (D-14b). */
  badge?: 'HOST' | 'VERIFIED';
  time: string;
  text: string;
}

export interface PendingMember {
  id: string;
  handle: string;
  badge?: 'HOST' | 'VERIFIED';
  requestedAt: string;
}

export interface ApprovedMember {
  handle: string;
  badge?: 'HOST' | 'VERIFIED';
  lastActive: string;
}

export interface MyRoom {
  name: string;
  slug: string;
  /** Handle anonim milik pengguna untuk room ini (D-14a). */
  handle: string;
  status: 'APPROVED' | 'PENDING';
  unread: number;
  endsIn: string;
}

/** Kategori FYP — seed default TASK bagian 3; daftar final menunggu keputusan manusia (T-72). */
export const categories = [
  'umum',
  'kampus',
  'hobi',
  'curhat',
  'game',
  'belajar',
  'lainnya',
] as const;

export type Category = (typeof categories)[number];

export const quota: Quota = { used: 2, max: 3, tier: 'free' };

/** Contoh kuota publik penuh: satu room demo di bawah tersimulasi PUBLIC. */
export const publicQuota: PublicQuota = { used: 1, max: 1 };

export const hostRooms: HostRoom[] = [
  {
    id: 'demo-room-1',
    slug: 'k3tK9mQp2weR7uds',
    name: 'Rapat & Koordinasi KKN',
    status: 'ACTIVE',
    visibility: 'PRIVATE',
    approvedCount: 12,
    pendingCount: 2,
    maxGuests: 40,
    endsIn: 'berakhir 6 hari',
    typingOn: true,
  },
  {
    id: 'demo-room-2',
    slug: 'xD8pWnQ3sJmT2vhL',
    name: 'Curhat Sesama Mahasiswa',
    status: 'ACTIVE',
    visibility: 'PUBLIC',
    approvedCount: 23,
    pendingCount: 0,
    maxGuests: 40,
    endsIn: 'berakhir 2 hari',
    typingOn: true,
  },
  {
    id: 'demo-room-3',
    slug: 'pN4rFzK7bWqM8jcD',
    name: 'Musyawarah Persewaan',
    status: 'CLOSED',
    visibility: 'PRIVATE',
    approvedCount: 18,
    pendingCount: 0,
    maxGuests: 25,
    endsIn: 'arsip 14 hari lagi',
    typingOn: false,
  },
];

/** Password tampil sekali — hanya contoh render (Space Mono, tanpa lega). */
export const newRoomPassword = 'K3TX9M';

export const guestRoomName = 'Ngobrol Santai (demo)';
/** Room demo pratinjau chat disimulasikan publik agar chip + pemberitahuan terlihat. */
export const guestRoomVisibility: 'PRIVATE' | 'PUBLIC' = 'PUBLIC';
/** Handle "kamu" pada pratinjau chat (?state=chat). */
export const guestSelfHandle = 'k7v9m2qx1';

export const chat: ChatMessage[] = [
  {
    id: 1,
    sender: 'HOST',
    handle: 'a5d8k2r7t',
    badge: 'HOST',
    time: '14:00',
    text: 'Selamat datang semua. Jadi geladi besok jam 07.00 di gerbang kampus ya.',
  },
  {
    id: 2,
    sender: 'GUEST',
    handle: 'wu32t76e3',
    time: '14:01',
    text: 'Siap. Yang bawa alat ramping-an, inget bareng-bareng ya.',
  },
  {
    id: 3,
    sender: 'GUEST',
    handle: 'bem.kampus',
    badge: 'VERIFIED',
    time: '14:03',
    text: 'Aku bawa satu alat, nanti bisa dipinjem kalau ada yang lupa.',
  },
  {
    id: 4,
    sender: 'GUEST',
    handle: 'k7v9m2qx1',
    time: '14:04',
    text: 'Kalau gerbang ternyata ditutup, titik kumpul lanjutannya di mana?',
  },
  {
    id: 5,
    sender: 'HOST',
    handle: 'a5d8k2r7t',
    badge: 'HOST',
    time: '14:05',
    text: 'Masjid kampus. Info lanjut menyusul di sini juga.',
  },
];

export const pendingMembers: PendingMember[] = [
  { id: 'pm-1', handle: 'f2x6j9c4v', requestedAt: '3 menit lalu' },
  { id: 'pm-2', handle: 'bem.kampus', badge: 'VERIFIED', requestedAt: '11 menit lalu' },
];

export const approvedMembers: ApprovedMember[] = [
  { handle: 'wu32t76e3', lastActive: 'aktif baru saja' },
  { handle: 'k7v9m2qx1', lastActive: 'aktif 2 menit lalu' },
  { handle: 'bem.kampus', badge: 'VERIFIED', lastActive: 'aktif 4 menit lalu' },
  { handle: 'f2x6j9c4v', lastActive: 'aktif 5 menit lalu' },
  { handle: 'm3r7t5p2d', lastActive: 'aktif 20 menit lalu' },
];

export const myRooms: MyRoom[] = [
  {
    name: 'Rapat & Koordinasi KKN',
    slug: 'k3tK9mQp2weR7uds',
    handle: 'k7v9m2qx1',
    status: 'APPROVED',
    unread: 3,
    endsIn: 'berakhir 6 hari',
  },
  {
    name: 'Curhat Sesama Mahasiswa',
    slug: 'xD8pWnQ3sJmT2vhL',
    handle: 'f2x6j9c4v',
    status: 'PENDING',
    unread: 0,
    endsIn: 'berakhir 2 hari',
  },
];

/** Keadaan Guest untuk pratinjau statis lewat ?state= (verifikasi bagian 11). */
export const guestStates: Array<{ key: string; label: string }> = [
  { key: 'disclaimer', label: 'disclaimer' },
  { key: 'password', label: 'form password' },
  { key: 'salah', label: 'password salah' },
  { key: 'kunci', label: 'terkunci' },
  { key: 'penuh', label: 'kursi penuh' },
  { key: 'pending', label: 'menunggu persetujuan' },
  { key: 'ditolak', label: 'ditolak' },
  { key: 'keluar', label: 'dikeluarkan' },
  { key: 'idle', label: 'keluar otomatis (idle)' },
  { key: 'tutup', label: 'room ditutup' },
  { key: 'satu', label: 'batas 1 room (anonim)' },
  { key: 'maks', label: 'batas 5 room (login)' },
  { key: 'chat', label: 'obrolan' },
];

/** Kartu FYP: salinan whitelist kolom `list_public_rooms` (TASK bagian 6, D-18).
    Tanpa identitas host, tanpa isi chat, tanpa kolom di luar whitelist. */
export interface PublicRoom {
  slug: string;
  name: string;
  description: string;
  category: Category;
  approvedCount: number;
  maxGuests: number;
  /** Menit sejak pesan terakhir — proxy untuk label aktivitas terakhir (D-18). */
  lastActivityMinutes: number;
  isFull: boolean;
}

/** Daftar tiruan FYP, tersusun TERBARU dulu (urutan server: `listed_at` desc saat sort NEW). */
export const publicRooms: PublicRoom[] = [
  {
    slug: 'm4kP2rVt9wQsJz1x',
    name: 'Final Putaran Kuis malam ini',
    description:
      'Kuis ringan tiap malam, pemenang diumumkan di chat. Salam sapa dulu, jangan tunggu lama.',
    category: 'lainnya',
    approvedCount: 40,
    maxGuests: 40,
    lastActivityMinutes: 1,
    isFull: true,
  },
  {
    slug: 'f7RwK3tQ9bNmZ5c2',
    name: 'Diskusi Etika AI',
    description: 'Kumpul sore membahas etika pemakaian AI untuk tugas dan pekerjaan kantoran.',
    category: 'belajar',
    approvedCount: 30,
    maxGuests: 40,
    lastActivityMinutes: 2,
    isFull: false,
  },
  {
    slug: 'j9qXc2Lm7BvHt4kd',
    name: 'Curhat Akhir Semester',
    description:
      'Tempat kumpul curhat dosen, tugas menumpuk, dan rencana liburan. Tetap sopan walau lelah.',
    category: 'curhat',
    approvedCount: 23,
    maxGuests: 40,
    lastActivityMinutes: 3,
    isFull: false,
  },
  {
    slug: 'n8sWb6Kp3TdmYz9h',
    name: 'Tim Esports Kampus',
    description: 'Papan koordinasi latihan dan pencarian pemain cadangan untuk turnamen M2.',
    category: 'game',
    approvedCount: 40,
    maxGuests: 40,
    lastActivityMinutes: 4,
    isFull: true,
  },
  {
    slug: 'g5Tz8wMq2BfxLr4y',
    name: 'Latihan Korps Drum Band',
    description: 'Pengumuman jadwal latihan dan pembagian permainan musik untuk lomba provinsi.',
    category: 'kampus',
    approvedCount: 12,
    maxGuests: 40,
    lastActivityMinutes: 35,
    isFull: false,
  },
  {
    slug: 'v2QmRn7tXpKdIc6u',
    name: 'Sewa Kontrakan Bareng',
    description: 'Mencari teman kontrakan dekat kampus. Diskusi harga, jaminan, dan bersama.',
    category: 'umum',
    approvedCount: 5,
    maxGuests: 40,
    lastActivityMinutes: 1560,
    isFull: false,
  },
  {
    slug: 'h4DyL9mW3TqvNr1s',
    name: 'Komunitas Rakit PC',
    description: 'Sharing kebutuhan komponen dan pengalaman merakit. Bawa spesifikasi kamu.',
    category: 'hobi',
    approvedCount: 9,
    maxGuests: 40,
    lastActivityMinutes: 2880,
    isFull: false,
  },
];
