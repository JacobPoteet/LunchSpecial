<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    const dispatch = createEventDispatcher();
  
    let guess = '';
  
    function submitGuess() {
      dispatch('submitGuess', guess);
      guess = '';
    }
  </script>
  
<input bind:value={guess} on:keydown|preventDefault={submitGuess}>
  <button on:click={submitGuess}>Guess</button>