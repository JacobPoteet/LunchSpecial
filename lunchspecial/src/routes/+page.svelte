<script lang="ts">
    import { onMount } from 'svelte';
    import IngredientList from './RecipeList.svelte';
    import Guess from './Guess.svelte';

    let recipes = [
        { name: 'Pizza', ingredients: ['Flour', 'Tomato', 'Cheese'] },
        { name: 'Pasta', ingredients: ['Flour', 'Egg', 'Tomato'] },
        { name: 'Burger', ingredients: ['Bread', 'Beef', 'Lettuce'] }
    ];

    let currentRecipeIndex = 0;
    let currentIngredientIndex = 0;
    let currentIngredients: string[] = [];

    onMount(() => {
        resetCurrentIngredients();
        console.log('Mounted. Current Ingredients:', currentIngredients);
    });

    function resetGame() {
        currentRecipeIndex = 0;
        resetCurrentIngredients();
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