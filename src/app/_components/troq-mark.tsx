// Marca do TROQ: duas setas que se cruzam (a troca) dentro de um quadrado
// arredondado. Decorativa: o nome "TROQ" ao lado e o texto acessivel.
export function TroqMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="9" fill="#1d4ed8" />
      <path
        d="M9 12.5h12.5m0 0-3.5-3.5m3.5 3.5-3.5 3.5"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M23 19.5H10.5m0 0 3.5-3.5m-3.5 3.5 3.5 3.5"
        fill="none"
        stroke="#5eead4"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
