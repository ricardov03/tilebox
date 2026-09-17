<!--
  WP0 placeholder. WP1 replaces this file with the real public page.
  It exists only to prove fonts, presets and icons load.
-->
<script setup lang="ts">
const { profile } = useProfile()
</script>

<template>
  <main class="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 px-4 py-16">
    <h1 class="font-display text-6xl font-semibold leading-none">
      {{ profile.profile.name }}
    </h1>
    <p class="font-sans text-lg text-muted">
      {{ profile.profile.bio }}
    </p>
    <p class="font-mono text-sm text-muted">
      @{{ profile.profile.handle }}
    </p>
    <Icon
      name="line-md:github"
      class="size-8 text-accent"
    />
  </main>
</template>
