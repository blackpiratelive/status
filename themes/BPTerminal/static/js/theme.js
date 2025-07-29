// Wait for the DOM to be fully loaded before running any scripts
document.addEventListener('DOMContentLoaded', () => {

    // --- Cookie Helper Functions ---
    function setCookie(name, value, days) {
        let expires = "";
        if (days) {
            const date = new Date();
            date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
            expires = "; expires=" + date.toUTCString();
        }
        document.cookie = name + "=" + (value || "") + expires + "; path=/";
    }

    function getCookie(name) {
        const nameEQ = name + "=";
        const ca = document.cookie.split(';');
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
        }
        return null;
    }

    // --- DOM Elements ---
    const themeSwitcher = document.getElementById('theme-switcher');
    const body = document.body;
    const colorSwatches = document.querySelectorAll('.color-swatch');
    const root = document.documentElement;

    // --- Theme Switching Logic ---
    if (themeSwitcher) {
        themeSwitcher.addEventListener('click', () => {
            body.classList.toggle('light-theme');
            const currentTheme = body.classList.contains('light-theme') ? 'light' : 'dark';
            setCookie('theme', currentTheme, 365);
            updateActiveSwatch();
        });
    }

    // --- Accent Color Logic ---
    if (colorSwatches.length > 0) {
        colorSwatches.forEach(swatch => {
            swatch.addEventListener('click', () => {
                const darkColor = swatch.dataset.colorDark;
                const lightColor = swatch.dataset.colorLight;
                setAccentColors(darkColor, lightColor);
                setCookie('accent_dark', darkColor, 365);
                setCookie('accent_light', lightColor, 365);
                updateActiveSwatch();
            });
        });
    }

    function setAccentColors(darkColor, lightColor) {
         root.style.setProperty('--accent-color-dark', darkColor);
         root.style.setProperty('--accent-color-light', lightColor);
    }

    function updateActiveSwatch() {
        if (!colorSwatches || colorSwatches.length === 0) return;
        const currentDark = getComputedStyle(root).getPropertyValue('--accent-color-dark').trim();
        colorSwatches.forEach(s => {
            if (s.dataset.colorDark === currentDark) {
                s.classList.add('active');
            } else {
                s.classList.remove('active');
            }
        });
    }

    // --- On Page Load ---
    function applyInitialSettings() {
        // Apply saved theme (light/dark)
        const savedTheme = getCookie('theme');
        if (savedTheme === 'light') {
            body.classList.add('light-theme');
        }

        // Apply saved accent colors
        const savedAccentDark = getCookie('accent_dark');
        const savedAccentLight = getCookie('accent_light');
        if (savedAccentDark && savedAccentLight) {
            setAccentColors(savedAccentDark, savedAccentLight);
        }
        
        // Update the active color swatch to reflect the current color
        if (colorSwatches.length > 0) {
            updateActiveSwatch();
        }
    }
    
    // --- Typing effect for the header ---
    const titleContainer = document.getElementById('header-title-container');
    if (titleContainer) {
        const titleElement = document.getElementById('header-title');
        const titleText = titleContainer.dataset.title || '';
        let i = 0;
        function typeWriter() {
            if (i < titleText.length) {
                titleElement.innerHTML += titleText.charAt(i);
                i++;
                setTimeout(typeWriter, 80);
            }
        }
        typeWriter();
    }
    
    // --- Run Initial Settings on page load ---
    applyInitialSettings();

});
