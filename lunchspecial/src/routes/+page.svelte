<script lang="ts">
    import { onMount } from 'svelte';
    import IngredientList from './IngredientList.svelte';
    import Guess from './Guess.svelte';
    import ClueList from './ClueList.svelte';

    let recipes = [
        { name: 'Pizza', ingredients: ['Flour', 'Tomato', 'Cheese'], clue: ['It is a round dish', 'It is a popular Italian dish']},
        { name: 'Pasta', ingredients: ['Flour', 'Egg', 'Tomato'], clue: ['It is a popular Italian dish', 'It is a noodle dish']},
        { name: 'Burger', ingredients: ['Bread', 'Beef', 'Lettuce'], clue: ['It is a sandwich', 'It is a popular American dish']}
    ];

    let currentRecipeIndex = 0;
    let currentIngredientIndex = 0;
    let currentClueIndex = 0;
    let currentIngredients: string[] = [];
    let currentClues: string[] = [];

    onMount(() => {
        resetCurrentIngredients();
        console.log('Mounted. Current Ingredients:', currentIngredients);
    });

    function resetGame() {
        currentRecipeIndex = 0;
        resetCurrentIngredients();
    }

    function requestClue() {
        currentClueIndex++;
        currentClues = [...currentClues, recipes[currentRecipeIndex].clue[currentClueIndex]];
        console.log('Requesting clue.');
    }

    function resetCurrentIngredients() {
        currentIngredientIndex = 0;
        currentIngredients = [];
        updateCurrentIngredients();
    }

    function updateCurrentIngredients() {
        currentIngredients = [...currentIngredients, recipes[currentRecipeIndex].ingredients[currentIngredientIndex]];
    }

    function handleGuess(event: any) {
        if (event.detail === recipes[currentRecipeIndex].name) {
            currentRecipeIndex++;
            resetCurrentIngredients();
            console.log('Correct guess. Moving to next recipe.');
        } else {
            currentIngredientIndex++;
            currentIngredients = [...currentIngredients, recipes[currentRecipeIndex].ingredients[currentIngredientIndex]];
            console.log('Incorrect guess. Moving to next clue. Current Ingredients:', currentIngredients);
        }
    }

</script>

<IngredientList bind:ingredients={currentIngredients} />
<Guess on:submitGuess={handleGuess} />

<ClueList bind:clues={currentClues} />
<button on:click={requestClue}>Request Clue</button>