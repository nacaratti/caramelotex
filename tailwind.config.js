/** @type {import('tailwindcss').Config} */
export default {
    content: ['./src/**/*.{html,js}'],
    theme: {
        extend: {
            colors: {
                'latex-green': '#008080',
                'latex-dark': '#1a1a2e',
                'latex-gray': '#16213e',
            },
        },
    },
    plugins: [],
};
