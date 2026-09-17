<template>
  <div class="flex min-h-screen flex-col">
    <a
      href="#main"
      class="sr-only z-20 rounded-tile bg-accent px-4 py-2 font-medium text-accent-ink focus:not-sr-only focus:fixed focus:top-4 focus:left-4"
    >
      Skip to content
    </a>
    <ThemeToggle />
    <main
      id="main"
      tabindex="-1"
      class="mx-auto w-full max-w-[1280px] p-4 focus:outline-none md:p-16"
    >
      <slot />
    </main>
    <footer class="mx-auto w-full max-w-[1280px] px-4 pb-8 font-mono text-[13px] text-muted md:px-16">
      <p>Made with tilebox</p>
    </footer>
  </div>
</template>
