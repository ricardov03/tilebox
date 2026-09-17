<script setup lang="ts">
const { profile } = useProfile()

// Theme attributes on <html>. WP1's useTheme will take over the live mode toggle.
const theme = profile.profile.theme
useHead({
  htmlAttrs: {
    'data-colors': theme.colors,
    'data-fonts': theme.fonts,
    'data-theme': theme.mode === 'dark' ? 'dark' : 'light',
  },
})
</script>

<template>
  <NuxtPage />
</template>
