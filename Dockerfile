# Use the official Deno image as a parent image
FROM denoland/deno:alpine

# Set the working directory in the container
WORKDIR /app

# Copy the application code
COPY . .

# Ensure the data directory exists
RUN mkdir -p /app/data

# Expose the port the app runs on
EXPOSE 9000

# Cache the dependencies as a layer
RUN deno cache scheduler.ts

# Start the application using deno task
CMD ["sh", "-c", "deno task scheduler"]
