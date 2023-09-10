async function handleTestVideo(_req, res) {
  res.status(200).send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <title>Test Video</title>
      <meta name="og:video" content="https://fs-audition-signup-fixed.vercel.app/testVideo.mp4">
      <meta name="og:video:type" content="video/mp4">
    </head>
    <body>
      <h1>Test test 123</h1>
    </body>
    </html>
  `);
}

module.exports = handleTestVideo;
