<template>
    <div id="app" class="app-container">
        <RouterView />
    </div>
</template>

<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<style>
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

html,
body,
#app {
    width: 100%;
    height: 100%;
    overflow: hidden;
}

.app-container {
    width: 100%;
    height: 100%;
    background-color: #f5f5f5;
    color: #333333;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}
</style>
