<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();

  let guess = '';

  function submitGuess() {
    dispatch('submitGuess', guess);
    guess = '';
  }

  function handleKeyDown(event : any) {
    if (event.key === 'Enter') {
      submitGuess();
    }
  }

</script>

<input bind:value={guess} on:keydown={handleKeyDown} />
<button on:click={submitGuess}>Guess</button>
