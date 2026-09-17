<script setup lang="ts">
const { profile } = useProfile()
const { name, bio } = profile.profile

useSeoMeta({
  title: name,
  description: bio,
  ogTitle: name,
  ogDescription: bio,
  ogImage: '/og.png',
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
