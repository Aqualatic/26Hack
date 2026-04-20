import pygame

pygame.init()
screen = pygame.display.set_mode((800, 600))
drawing = False

while True:
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            pygame.quit()
        elif event.type == pygame.MOUSEBUTTONDOWN:
            drawing = True
        elif event.type == pygame.MOUSEBUTTONUP:
            drawing = False

    if drawing:
        mouse_pos = pygame.mouse.get_pos()
        # Draw on the screen without clearing it to keep the "ink"
        pygame.draw.circle(screen, (255, 255, 255), mouse_pos, 5)

    pygame.display.flip()
