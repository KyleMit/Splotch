<script lang="ts">
</script>

<div class="squiggle-rule" aria-hidden="true"></div>

<style>
  .squiggle-rule {
    height: 8px;
    background: color-mix(
      in srgb,
      var(--squiggle-color, var(--page-rule)) var(--squiggle-strength),
      var(--page-sheet)
    );
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='8'%3E%3Cpath d='M0 4 Q6 0 12 4 T24 4' fill='none' stroke='black' stroke-width='2.5' stroke-linecap='round'/%3E%3C/svg%3E")
      repeat-x left center / 24px 8px;
  }
  @media (forced-colors: active) {
    .squiggle-rule {
      height: 0;
      mask: none;
      border-top: 2px solid CanvasText;
    }
  }
</style>
