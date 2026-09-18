<script setup lang="ts">
const { profile } = useProfile()
const { name, bio } = profile.profile

/** `NUXT_PUBLIC_SITE_URL` (no trailing slash). Empty = unknown, so og:image stays a path. */
const siteUrl = useRuntimeConfig().public.siteUrl.replace(/\/+$/, '')

useSeoMeta({
  title: name,
  description: bio,
  ogTitle: name,
  ogDescription: bio,
  ogImage: siteUrl ? `${siteUrl}/og.png` : '/og.png',
  ogImageWidth: 1200,
  ogImageHeight: 630,
  ogUrl: siteUrl ? `${siteUrl}/` : undefined,
  ogType: 'website',
  twitterCard: 'summary_large_image',
})
</script>

<template>
  <BentoGrid
    :blocks="profile.blocks"
    :layout="profile.layout"
    :profile="profile.profile"
  />
</template>
