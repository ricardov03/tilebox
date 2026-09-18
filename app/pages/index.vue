<script setup lang="ts">
const { profile } = useProfile()

// Title, description, canonical, Open Graph, favicon links and JSON-LD (WP10b).
useSiteHead()
</script>

<template>
  <BentoGrid
    :blocks="profile.blocks"
    :layout="profile.layout"
    :profile="profile.profile"
  />
</template>
