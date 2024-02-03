<script lang="ts">
    import Clue from './Clue.svelte';
    import Guess from './Guess.svelte';
  
    let recipes = [
      { name: 'Pizza', ingredients: ['Flour', 'Tomato', 'Cheese'] },
      // more recipes...
    ];
  
    let currentRecipeIndex = 0;
    let currentClueIndex = 0;
  
    function handleGuess(event: any) {
      if (event.detail === recipes[currentRecipeIndex].name) {
        currentRecipeIndex++;
        currentClueIndex = 0;
      } else {
        currentClueIndex++;
      }
    }
  </script>
  
  <Clue ingredient={recipes[currentRecipeIndex].ingredients[currentClueIndex]} />
  <Guess on:submitGuess={handleGuess} />