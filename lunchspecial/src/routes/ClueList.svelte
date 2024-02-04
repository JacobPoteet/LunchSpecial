<script lang="ts">
    export let clues: string[] = [];
  </script>
  
  <ul>
    {#each clues as clue}
      <li>{clue}</li>
    {/each}
  </ul>