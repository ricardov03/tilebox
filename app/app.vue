<script setup lang="ts">
const { profile } = useProfile()

// Preset attributes on <html>. `data-theme` (light/dark) is owned by useTheme.
const theme = profile.profile.theme
useHead({
  htmlAttrs: {
    'data-colors': theme.colors,
    'data-fonts': theme.fonts,
  },
})
useTheme()
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
