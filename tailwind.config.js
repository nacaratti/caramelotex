/** @type {import('tailwindcss').Config} */

// Cores semânticas: apontam para os tokens de src/styles/theme.css,
// que mudam entre os temas claro e escuro.
const token = (name) => `var(--${name})`;

export default {
    content: ['./src/**/*.{html,js}'],
    theme: {
        extend: {
            colors: {
                bg: token('bg'),
                panel: token('panel'),
                panel2: token('panel-2'),
                hover: token('hover'),
                ink: token('text'),
                muted: token('text-muted'),
                line: token('border'),
                accent: token('accent'),
                'accent-strong': token('accent-strong'),
                'accent-soft': token('accent-soft'),
                primary: token('primary'),
                'primary-hover': token('primary-hover'),
                'primary-ink': token('primary-text'),
                danger: token('danger'),
                warning: token('warning'),
                success: token('success'),
                pdf: token('pdf-bg'),
            },
            fontFamily: {
                sans: ['var(--font-ui)'],
                mono: ['var(--font-mono)'],
                brand: ['var(--font-brand)'],
            },
            borderRadius: {
                DEFAULT: 'var(--radius-sm)',
                lg: 'var(--radius)',
            },
            boxShadow: {
                soft: 'var(--shadow)',
            },
        },
    },
    plugins: [],
};
