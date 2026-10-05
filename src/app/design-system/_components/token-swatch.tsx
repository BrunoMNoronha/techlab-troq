import type { CSSProperties } from 'react';
import { Text } from '@/components/ui';
import styles from '../design-system.module.css';

const KIND = {
  color: styles.swatchColor,
  space: styles.spaceBar,
  radius: styles.radiusBox,
  shadow: styles.shadowBox,
};

/** Amostra de um token: o valor entra por custom property, único estilo dinâmico da vitrine. */
export function TokenSwatch({ token, kind }: { token: string; kind: keyof typeof KIND }) {
  return (
    <div className={styles.swatch}>
      <div className={KIND[kind]} style={{ '--swatch': `var(${token})` } as CSSProperties} />
      <Text as="code" size="caption" tone="muted" wrapAnywhere>
        {token}
      </Text>
    </div>
  );
}
