import { motion } from 'framer-motion';
import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'dark';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  loading?: boolean;
  fullWidth?: boolean;
}

const variants = {
  primary: 'bg-primary text-white hover:bg-primary-dark active:bg-primary-dark shadow-warm hover:shadow-warm-lg border-2 border-primary',
  secondary: 'bg-secondary text-white hover:bg-amber-600 active:bg-amber-600 shadow-warm hover:shadow-warm-lg border-2 border-secondary',
  outline: 'bg-transparent text-primary border-2 border-primary hover:bg-primary hover:text-white active:bg-primary active:text-white',
  ghost: 'bg-transparent text-dark border-2 border-transparent hover:bg-background-warm active:bg-background-warm',
  dark: 'bg-dark text-white hover:bg-dark-muted active:bg-dark-muted border-2 border-dark',
};

const sizes = {
  sm: 'px-4 py-2.5 text-sm rounded-lg min-h-[44px]',
  md: 'px-6 py-3 text-base rounded-xl min-h-[48px]',
  lg: 'px-6 py-3.5 text-base rounded-xl min-h-[48px] sm:px-8 sm:py-4 sm:text-lg sm:min-h-[56px]',
  xl: 'px-6 py-3.5 text-base rounded-xl min-h-[48px] sm:px-10 sm:py-5 sm:text-xl sm:rounded-2xl sm:min-h-[64px]',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  return (
    <motion.button
      whileHover={{ scale: disabled || loading ? 1 : 1.02 }}
      whileTap={{ scale: disabled || loading ? 1 : 0.98 }}
      className={`
        inline-flex items-center justify-center gap-2
        font-button font-semibold tracking-wide
        transition-all duration-200 ease-out
        disabled:opacity-60 disabled:cursor-not-allowed
        ${variants[variant]}
        ${sizes[size]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
      disabled={disabled || loading}
      {...(props as any)}
    >
      {loading ? (
        <>
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <span>Loading...</span>
        </>
      ) : children}
    </motion.button>
  );
}
