package io.github.gallo.sonycamera.demo

import android.content.Context
import android.graphics.Bitmap
import android.os.BatteryManager
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import io.github.gallo.sonycamera.CameraConnectionState
import io.github.gallo.sonycamera.CameraEvent
import io.github.gallo.sonycamera.service.CameraConnectionClient
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val Accent = Color(0xFFFF5A3C)
private val Ink = Color(0xFF09090B)
private val Panel = Color(0xCC111114)

@Composable
fun CameraScreen(camera: CameraConnectionClient) {
    MaterialTheme(colorScheme = darkColorScheme(primary = Accent, background = Ink)) {
        Surface(color = Ink, modifier = Modifier.fillMaxSize()) {
            val context = LocalContext.current
            val scope = rememberCoroutineScope()
            val state by camera.connectionState.collectAsStateWithLifecycle()
            val cameraName by camera.cameraName.collectAsStateWithLifecycle()

            var frame by remember { mutableStateOf<Bitmap?>(null) }
            var zoom by remember { mutableFloatStateOf(1f) }
            var tabletBattery by remember { mutableIntStateOf(-1) }
            var fps by remember { mutableFloatStateOf(0f) }
            var framesThisSecond by remember { mutableIntStateOf(0) }
            var fpsWindowStart by remember { mutableStateOf(System.currentTimeMillis()) }
            var lastError by remember { mutableStateOf<String?>(null) }

            LaunchedEffect(camera) {
                camera.liveviewFrames.collect { bitmap ->
                    frame = bitmap
                    framesThisSecond++
                    val now = System.currentTimeMillis()
                    val dt = now - fpsWindowStart
                    if (dt >= 1000L) {
                        fps = framesThisSecond * 1000f / dt.coerceAtLeast(1L)
                        framesThisSecond = 0
                        fpsWindowStart = now
                    }
                }
            }

            LaunchedEffect(camera) {
                camera.events.collect { event ->
                    when (event) {
                        is CameraEvent.Error -> lastError = event.message
                        is CameraEvent.ConnectionLost -> lastError = "USB connection lost"
                        else -> Unit
                    }
                }
            }

            LaunchedEffect(Unit) {
                val bm = context.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
                while (true) {
                    tabletBattery = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
                    delay(5000)
                }
            }

            Box(Modifier.fillMaxSize().background(Ink)) {
                val live = frame
                if (live != null) {
                    Image(
                        bitmap = live!!.asImageBitmap(),
                        contentDescription = "Sony live view",
                        contentScale = ContentScale.Fit,
                        modifier = Modifier
                            .fillMaxSize()
                            .graphicsLayer(scaleX = zoom, scaleY = zoom)
                    )
                } else {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        when (state) {
                            is CameraConnectionState.Connecting,
                            is CameraConnectionState.Initializing,
                            is CameraConnectionState.Scanning -> CircularProgressIndicator(color = Accent)
                            is CameraConnectionState.Error -> Text("Ошибка: ${(state as CameraConnectionState.Error).message}", color = Color.White)
                            else -> Text("Подключи ZV-E10 по USB / PC Remote", color = Color.White.copy(alpha = 0.75f), fontSize = 18.sp)
                        }
                    }
                }

                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .align(Alignment.TopCenter)
                        .padding(top = 14.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .background(Panel)
                        .padding(horizontal = 14.dp, vertical = 9.dp)
                ) {
                    val connected = state is CameraConnectionState.Ready
                    Box(Modifier.size(9.dp).clip(CircleShape).background(if (connected) Color(0xFF32D583) else Color(0xFFFFC857)))
                    Text(cameraName ?: if (connected) "Sony" else "Нет камеры", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                    Text("• ${"%.1f".format(fps)} FPS", color = Color.White.copy(alpha = 0.8f), fontSize = 13.sp)
                    Text("• TAB ${if (tabletBattery >= 0) "$tabletBattery%" else "—"}", color = Color.White.copy(alpha = 0.8f), fontSize = 13.sp)
                }

                Column(
                    horizontalAlignment = Alignment.End,
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.align(Alignment.CenterEnd).padding(end = 14.dp)
                ) {
                    listOf(1f, 2f, 4f).forEach { z ->
                        Button(
                            onClick = { zoom = z },
                            colors = ButtonDefaults.buttonColors(containerColor = if (zoom == z) Accent else Panel),
                            shape = RoundedCornerShape(12.dp)
                        ) { Text("${z.toInt()}×") }
                    }
                }

                Row(
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(bottom = 18.dp)
                        .clip(RoundedCornerShape(18.dp))
                        .background(Panel)
                        .padding(10.dp)
                ) {
                    when (state) {
                        is CameraConnectionState.Ready -> {
                            Button(onClick = { scope.launch { camera.takePhoto() } }, colors = ButtonDefaults.buttonColors(containerColor = Accent)) {
                                Text("PHOTO")
                            }
                            Button(onClick = { camera.disconnect() }, colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF33333A))) {
                                Text("DISCONNECT")
                            }
                        }
                        else -> Button(onClick = { lastError = null; camera.connectToCamera() }, colors = ButtonDefaults.buttonColors(containerColor = Accent)) {
                            Text("CONNECT")
                        }
                    }

                    Spacer(Modifier.width(6.dp))
                    Text("PZ", color = Color.White.copy(alpha = 0.55f), fontSize = 12.sp)
                    Button(onClick = { }, enabled = false, colors = ButtonDefaults.buttonColors(disabledContainerColor = Color(0xFF26262C))) { Text("W") }
                    Button(onClick = { }, enabled = false, colors = ButtonDefaults.buttonColors(disabledContainerColor = Color(0xFF26262C))) { Text("STOP") }
                    Button(onClick = { }, enabled = false, colors = ButtonDefaults.buttonColors(disabledContainerColor = Color(0xFF26262C))) { Text("T") }
                }

                lastError?.let { msg ->
                    Text(
                        msg,
                        color = Color.White,
                        fontSize = 13.sp,
                        modifier = Modifier
                            .align(Alignment.TopCenter)
                            .padding(top = 64.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(Accent.copy(alpha = 0.92f))
                            .padding(horizontal = 12.dp, vertical = 8.dp)
                    )
                }
            }
        }
    }
}
