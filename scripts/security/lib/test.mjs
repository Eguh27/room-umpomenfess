function detailText(value) {
  if (value === undefined || value === null || value === '') return '';
  return String(value).replace(/\s+/g, ' ').slice(0, 320);
}

export async function runTest(def, baseContext) {
  const checks = [];
  const ctx = {
    ...baseContext,
    check(label, pass, detail) {
      checks.push({ label, pass: Boolean(pass), detail: detailText(detail) });
    },
  };

  try {
    await def.run(ctx);
  } catch (error) {
    checks.push({
      label: 'exception',
      pass: false,
      detail: detailText(error instanceof Error ? error.message : error),
    });
  }

  const pass = checks.length > 0 && checks.every((check) => check.pass);
  console.log(`${pass ? 'LULUS' : 'GAGAL'} ${def.id} — ${def.title}`);
  for (const check of checks) {
    if (!check.pass) {
      console.log(`  GAGAL: ${check.label}${check.detail ? ` (${check.detail})` : ''}`);
    }
  }
  return { id: def.id, title: def.title, pass, checks };
}

export function checkRpcError(ctx, result, expected, label) {
  const actual = result?.error?.message ?? null;
  ctx.check(
    label,
    actual === expected,
    `status=${result?.status ?? '?'} message=${actual ?? 'none'}`,
  );
}

export function checkRpcSuccess(ctx, result, label) {
  ctx.check(
    label,
    result?.ok && !result?.error,
    `status=${result?.status ?? '?'} message=${result?.error?.message ?? 'none'}`,
  );
}

export function checkDenied(ctx, result, label) {
  const empty = Array.isArray(result?.data) && result.data.length === 0;
  ctx.check(
    label,
    !result?.ok || empty,
    `status=${result?.status ?? '?'} rows=${Array.isArray(result?.data) ? result.data.length : 'n/a'}`,
  );
}

export function checkEmptyArray(ctx, result, label) {
  ctx.check(
    label,
    result?.ok && Array.isArray(result.data) && result.data.length === 0,
    `status=${result?.status ?? '?'} rows=${Array.isArray(result?.data) ? result.data.length : 'n/a'}`,
  );
}
