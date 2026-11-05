/**
 * Tipe + salinan keadaan join Guest (TASK.md bagian 7 dan 11).
 * Semua teks UI di sini — komponen React cukup memetakan kode → teks.
 */

export type JoinSuccess = {
  ok: true;
  status: 'APPROVED' | 'PENDING';
  roomId: string;
  memberId: string;
  /** Kontrak B saat ini masih `displayName`; T-52a menggantinya dengan handle server. */
  displayName: string;
};

export type JoinFailure = {
  ok: false;
  /** Kode error sesuai TASK bagian 7, atau SERVER_ERROR/NETWORK/SESSION_INIT. */
  code: string;
  retryAfter?: number;
};

export type JoinOutcome = JoinSuccess | JoinFailure;

export type JoinCta = {
  label: string;
  target: 'form' | 'home' | 'rooms';
};

export type JoinFeedback = {
  /** warn = coba lagi boleh, note = info netral, danger = tertutup untuk user ini. */
  tone: 'warn' | 'note' | 'danger';
  title: string;
  body: string;
  cta: JoinCta | null;
  /** true → tampilkan hitung mundur dari retryAfter. */
  countdown: boolean;
};

/** Pesan inline pada form (fitur: error muncul di dekat field, bukan hanya papan atas). */
export function formErrorFor(code: string): string | null {
  switch (code) {
    case 'WRONG_PASSWORD':
      return 'Password salah. Periksa lagi — huruf besar-kecil tidak berpengaruh, tapi satu karakter yang salah cukup membuat gagal. Lima password salah dalam 15 menit mengunci percobaan dari jaringanmu.';
    case 'TURNSTILE_FAILED':
      return 'Pengecekan manusia gagal. Ulangi verifikasi di bawah, lalu kirim lagi.';
    case 'INVALID_INPUT':
      return 'Bentuk password belum tepat — enam huruf/angka tanpa simbol.';
    case 'UNAUTHORIZED':
      return 'Sesi verifikasi kedaluwarsa. Kirim lagi — sesi baru dibuat otomatis.';
    case 'SERVER_ERROR':
      return 'Server sedang bermasalah. Tunggu sebentar, lalu kirim lagi.';
    default:
      return null;
  }
}

/** Kode error yang menampilkan layar penuh, bukan kembali ke form. */
export function feedbackFor(code: string): JoinFeedback | null {
  switch (code) {
    case 'LOCKED':
    case 'ROOM_COOLDOWN':
      return {
        tone: 'danger',
        title: 'Terlalu banyak percobaan',
        body: 'Percobaan masuk dari jaringanmu terkunci sementara. Tunggu hitung mundur di bawah selesai, lalu coba masuk lagi.',
        cta: null,
        countdown: true,
      };
    case 'ROOM_FULL':
      return {
        tone: 'note',
        title: 'Kursi penuh',
        body: 'Password sudah benar, tapi kapasitas room sudah habis. Guest yang diam dilepas otomatis — coba lagi beberapa saat, tanpa perlu password baru.',
        cta: { label: 'Coba lagi nanti', target: 'form' },
        countdown: false,
      };
    case 'ONE_ROOM_LIMIT':
      return {
        tone: 'note',
        title: 'Masih ada satu room aktif',
        body: 'Sesi anonim hanya boleh punya satu keanggotaan aktif. Keluar dulu dari room yang masih terbuka, lalu buka link room ini lagi.',
        cta: { label: 'Buka Ruang saya', target: 'rooms' },
        countdown: false,
      };
    case 'MAX_ROOMS_PER_GUEST':
      return {
        tone: 'note',
        title: 'Batas 5 room tercapai',
        body: 'Akun login boleh mengikuti maksimum 5 room aktif. Tinggalkan salah satu dari daftar room kamu untuk membuka kursi.',
        cta: { label: 'Buka Ruang saya', target: 'rooms' },
        countdown: false,
      };
    case 'KICKED':
      return {
        tone: 'danger',
        title: 'Kamu dikeluarkan dari room',
        body: 'Host mengeluarkanmu dari room ini. Handle-mu di room ini ditutup dan tidak bisa dipakai lagi. Bila kamu merasa ini keliru, bicarakan langsung dengan Host di luar platform.',
        cta: { label: 'Tutup', target: 'home' },
        countdown: false,
      };
    case 'REJECTED':
      return {
        tone: 'danger',
        title: 'Permintaanmu ditolak',
        body: 'Host memutuskan tidak memasukkanmu ke room ini. Link yang sama tidak bisa dipakai ulang untuk room yang sama.',
        cta: { label: 'Tutup', target: 'home' },
        countdown: false,
      };
    case 'ROOM_CLOSED':
      return {
        tone: 'note',
        title: 'Room sudah ditutup',
        body: 'Percakapan terkunci untuk semua orang. Hanya Host yang masih bisa membaca dan mengekspornya selama 15 hari, lalu isi room dihapus permanen.',
        cta: { label: 'Tutup', target: 'home' },
        countdown: false,
      };
    case 'ROOM_NOT_FOUND':
      return {
        tone: 'note',
        title: 'Room tidak ditemukan',
        body: 'Link mungkin salah tulis, atau room-nya sudah dihapus permanen setelah 7 hari aktif ditambah 15 hari arsip.',
        cta: { label: 'Kembali ke beranda', target: 'home' },
        countdown: false,
      };
    case 'SESSION_INIT':
    case 'ANON_DISABLED':
    case 'NETWORK':
      return {
        tone: 'warn',
        title: 'Sesi tidak bisa dibuka',
        body: 'Koneksi ke layanan otentikasi gagal atau anonymous sign-in belum aktif. Coba lagi; bila berulang, beri tahu pengelola situs.',
        cta: { label: 'Coba lagi', target: 'form' },
        countdown: false,
      };
    default:
      return null;
  }
}
