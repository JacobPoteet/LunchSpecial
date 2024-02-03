<script lang="ts">
  export let ingredients: string[] = [];
</script>

<ul>
  {#each ingredients as ingredient}
    <li>{ingredient}</li>
  {/each}
</ul>