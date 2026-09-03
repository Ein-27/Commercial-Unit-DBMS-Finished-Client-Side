import type { ComponentPropsWithoutRef } from 'react';

const logoUrl = new URL('../../../CommercialUnitLogo.png', import.meta.url).href;

interface LogoProps extends ComponentPropsWithoutRef<'img'> {
  alt?: string;
}

export function Logo({ alt = 'Commercial Unit Logo', className, ...props }: LogoProps) {
  return <img src={logoUrl} alt={alt} className={`object-cover w-full h-full ${className ?? ''}`} {...props} />;
}
