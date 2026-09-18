<!--
  The WP11 part of the Site tab: share button, contact card, QR code, UTM tags.
  ONE include in SitePanel.vue. Each panel reads and writes the draft through
  `useSiteDraft()` (provide / inject from `useEditor()`), so no prop and no event
  passes through SitePanel.vue or edit.vue.
-->
<template>
  <div
    class="flex flex-col gap-4 border-t border-line pt-4"
    data-site-extras
  >
    <EditorSharePanel />
    <EditorContactPanel />
    <EditorQrPanel />
    <EditorUtmPanel />
  </div>
</template>
