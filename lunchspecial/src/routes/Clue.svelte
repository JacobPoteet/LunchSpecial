<script lang="ts">
  export let ingredients: string[] = [];
</script>

<ul>
  {#each ingredients as ingredient (ingredient)}
    <li>{ingredient}</li>
  {/each}
</ul>