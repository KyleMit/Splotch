<script lang="ts">
  import BetaEnrollmentPage from '$lib/components/beta/BetaEnrollmentPage.svelte';
</script>

<svelte:head>
  <title>Join the Android Beta · Splotch</title>
  <meta
    name="description"
    content="How to become an Android beta tester for Splotch: join the testers group, opt in on Google Play, and install the app."
  />
  <!-- Link-only page: keeping it out of search indexes limits how widely the
       support address on it circulates. Deliberately NOT paired with a
       robots.txt Disallow — a blocked crawler never fetches the page, so it
       would never see this tag and could still index the bare URL. -->
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<BetaEnrollmentPage platform="android" />
